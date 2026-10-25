/**
 * Case, packet, job, approval, handoff, and submission API routes.
 *
 * Every route is authenticated and permission-checked. The audit actor is ALWAYS
 * derived from req.authUser (the authenticated session), never from a body field.
 *
 * State machine surfaced to clients:
 *   packet_ready -> approved -> handoff_generated -> submitted
 * with needs_review / needs_more_data / ineligible / failed as terminal-ish side
 * states. Deadline urgency is retained until a submission receipt is recorded.
 */

import { Router } from 'express';
import type { Services } from '../services.ts';
import type { EHRPort } from '../ports/ehrPort.ts';
import type { UserRepository } from '../auth/userRepository.ts';
import { requireAuth, requirePermission } from '../auth/middleware.ts';
import { intakeDenialFromPdf } from '../intake/denialIntake.ts';
import { processDenial } from '../pipeline/orchestrator.ts';
import type { Denial } from '../domain/types.ts';
import {
  generateHandoff,
  recordSubmission,
  SubmissionError,
} from '../submission/submissionHandoff.ts';
import { daysUntil } from '../pipeline/classifier.ts';
import { OPEN_FOR_DEADLINE, type AppealCaseState } from '../domain/types.ts';

export const createCaseRouter = (services: Services, ehr: EHRPort, users: UserRepository): Router => {
  const router = Router();
  const { cases, audit, jobs, ai, orchestratorDeps } = services;

  // States from which a case may be re-run (resumed/repaired). Mirrors the
  // orchestrator RESUMABLE set's human-actionable subset: a failed run plus the
  // two deterministic "held" states a human may retry after remediation.
  const RETRYABLE = new Set(['failed', 'needs_more_data', 'needs_review']);

  // All case routes require authentication.
  router.use(requireAuth(users));

  // --- Reads (view_cases) ---

  router.get('/cases', requirePermission('view_cases'), (_req, res) => {
    const list = cases.listCases().map((c) => ({
      id: c.id,
      denialId: c.denialId,
      state: c.state,
      category: c.classification?.category ?? null,
      appealDeadline: c.classification?.appealDeadline ?? null,
      deadlineStatus: c.classification?.deadlineStatus ?? null,
      gateDecision: c.gate?.decision ?? null,
      packetVersion: c.packetVersion,
      approvedVersion: c.approvedVersion,
      packetReady: c.state === 'packet_ready',
      updatedAt: c.updatedAt,
    }));
    res.json({ count: list.length, cases: list });
  });

  router.get('/cases/:id', requirePermission('view_cases'), (req, res) => {
    const c = cases.getCase(req.params.id);
    if (!c) return res.status(404).json({ error: 'case not found' });
    res.json({ case: c, audit: audit.forCase(c.id) });
  });

  // --- Approval (approve_appeal). Version-checked, fail-closed. ---

  router.post('/cases/:id/approve', requirePermission('approve_appeal'), (req, res) => {
    const c = cases.getCase(req.params.id);
    if (!c) return res.status(404).json({ error: 'case not found' });

    // Fail closed: only an AI-validated, complete packet is approvable.
    if (c.state !== 'packet_ready') {
      return res.status(409).json({ error: `cannot approve from state ${c.state}` });
    }
    if (!c.packet || !c.packet.aiValidationPassed) {
      return res.status(409).json({ error: 'packet has not passed AI validation' });
    }
    if (c.packet.evidence.length === 0) {
      return res.status(409).json({ error: 'packet has no supporting evidence' });
    }
    if (c.classification?.deadlineStatus !== 'calculated' || !c.classification?.appealDeadline) {
      return res.status(409).json({
        error: 'appeal deadline is unknown; supply the missing date/rule before approval',
        deadlineBlockers: c.classification?.deadlineBlockers ?? [],
      });
    }

    // Version guard: client must approve the exact version it reviewed.
    const expectedVersion = Number(req.body?.packetVersion);
    if (!Number.isInteger(expectedVersion)) {
      return res.status(400).json({ error: 'packetVersion (integer) is required' });
    }

    const result = cases.approve(c.id, req.authUser!.id, expectedVersion);
    if (!result.ok) {
      return res.status(409).json({ error: result.reason });
    }
    audit.log({ caseId: c.id, actor: req.authUser!.id, action: 'approved', detail: `v${expectedVersion}` });
    res.json({ ok: true, state: 'approved', approvedVersion: expectedVersion });
  });

  // --- Retry a resumable/held case (run_pipeline) ---

  // Re-runs the pipeline for a case stuck in failed / needs_more_data /
  // needs_review. The orchestrator's resume path repairs the EXISTING case (and
  // re-inserts the denial idempotently on its id), so no duplicate denial/case
  // rows are created. The denial carries idempotency key denial:<id>, so no
  // duplicate job rows are created either.
  router.post('/cases/:id/retry', requirePermission('run_pipeline'), async (req, res, next) => {
    try {
      const c = cases.getCase(req.params.id);
      if (!c) return res.status(404).json({ error: 'case not found' });
      if (!RETRYABLE.has(c.state)) {
        return res.status(409).json({ error: `cannot retry from state ${c.state}` });
      }

      // Resolve the underlying denial for this case (synthetic/local source).
      const denials = await ehr.discoverDenials();
      const denial: Denial | undefined = denials.find((d) => d.id === c.denialId);
      if (!denial) {
        return res.status(409).json({ error: `denial ${c.denialId} is no longer discoverable; cannot retry` });
      }

      // Re-run through the orchestrator directly: its resume branch updates the
      // existing case rather than creating a second one, and insertDenial is
      // idempotent on the denial id (no PRIMARY KEY violation, no duplicate).
      const result = await processDenial(orchestratorDeps, denial);
      res.json({ caseId: result.caseId, state: result.state, packetReady: result.packetReady });
    } catch (err) {
      next(err);
    }
  });

  // --- Pipeline runs (run_pipeline) ---

  router.post('/run/denial/:denialId', requirePermission('run_pipeline'), async (req, res, next) => {
    try {
      const denials = await ehr.discoverDenials();
      const denial = denials.find((d) => d.id === req.params.denialId);
      if (!denial) return res.status(404).json({ error: 'denial not found' });
      const jobId = jobs.enqueueProcessDenial(denial, denial.id);
      await jobs.drain();
      const c = cases.getCaseByDenial(denial.id);
      res.json({ jobId, caseId: c?.id ?? null, state: c?.state ?? null });
    } catch (err) {
      next(err);
    }
  });

  router.post('/intake/pdf', requirePermission('run_pipeline'), async (req, res, next) => {
    try {
      const { text, claimId, carrier, denialId, externalRef } = req.body ?? {};
      if (!text || !claimId || !denialId) {
        return res.status(400).json({ error: 'text, claimId and denialId are required' });
      }
      const denial = await intakeDenialFromPdf(ai, { text, claimId, carrier, denialId, externalRef });
      const jobId = jobs.enqueueProcessDenial(denial, denial.id);
      await jobs.drain();
      const c = cases.getCaseByDenial(denial.id);
      res.json({ jobId, denial, caseId: c?.id ?? null, state: c?.state ?? null });
    } catch (err) {
      next(err);
    }
  });

  router.post('/run/poll', requirePermission('run_pipeline'), async (req, res, next) => {
    try {
      jobs.enqueue('poll_denials', { since: req.body?.since });
      const processed = await jobs.drain();
      res.json({ processed, cases: cases.listCases().length });
    } catch (err) {
      next(err);
    }
  });

  // --- Handoff generation (generate_handoff). NOT submission. ---

  router.post('/cases/:id/handoff', requirePermission('generate_handoff'), (req, res, next) => {
    try {
      const pkg = generateHandoff(cases, audit, req.params.id, req.authUser!.id);
      res.json({ ok: true, state: 'handoff_generated', package: pkg });
    } catch (err) {
      if (err instanceof SubmissionError) return res.status(409).json({ error: err.message });
      next(err);
    }
  });

  // Download the generated handoff artifact.
  router.get('/cases/:id/handoff', requirePermission('view_cases'), (req, res) => {
    const handoff = cases.getHandoff(req.params.id);
    if (!handoff) return res.status(404).json({ error: 'no handoff generated for this case' });
    res.setHeader('content-disposition', `attachment; filename="handoff_${req.params.id}.json"`);
    res.json(handoff);
  });

  // --- Submission receipt (record_submission). Marks submitted. ---

  router.post('/cases/:id/submit', requirePermission('record_submission'), (req, res, next) => {
    try {
      const { channel, confirmationNumber, submittedAt, note } = req.body ?? {};
      const result = recordSubmission(cases, audit, req.params.id, req.authUser!.id, {
        channel,
        confirmationNumber,
        submittedAt,
        note,
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      if (err instanceof SubmissionError) return res.status(409).json({ error: err.message });
      next(err);
    }
  });

  // --- Summary + deadlines (view_cases) ---

  router.get('/summary', requirePermission('view_cases'), (_req, res) => {
    const now = new Date().toISOString().slice(0, 10);
    const all = cases.listCases();

    const deadlines = all.map((c) => {
      const cls = c.classification;
      const deadline = cls?.appealDeadline ?? null;
      const known = cls?.deadlineStatus === 'calculated' && Boolean(deadline);
      return {
        caseId: c.id,
        denialId: c.denialId,
        state: c.state,
        deadlineKnown: known,
        appealDeadline: deadline,
        deadlineStatus: cls?.deadlineStatus ?? null,
        deadlineBlockers: cls?.deadlineBlockers ?? [],
        daysRemaining: known ? daysUntil(deadline, now) : null,
      };
    });

    // Urgency retained until a submission receipt is recorded (state 'submitted').
    const open = (s: AppealCaseState) => OPEN_FOR_DEADLINE.includes(s);
    const urgentDeadlines = deadlines.filter(
      (d) => d.deadlineKnown && open(d.state as AppealCaseState) && (d.daysRemaining ?? 99) <= 14,
    );
    const unknownDeadlines = deadlines.filter((d) => !d.deadlineKnown && open(d.state as AppealCaseState));

    const byState: Record<string, number> = {};
    for (const c of all) byState[c.state] = (byState[c.state] ?? 0) + 1;

    res.json({
      total: all.length,
      byState,
      packetsReady: byState['packet_ready'] ?? 0,
      needsReview: byState['needs_review'] ?? 0,
      approved: byState['approved'] ?? 0,
      handoffGenerated: byState['handoff_generated'] ?? 0,
      submitted: byState['submitted'] ?? 0,
      urgentDeadlines,
      unknownDeadlines,
      deadlines: deadlines.sort((a, b) => {
        // Known deadlines first (by urgency), then unknowns.
        if (a.deadlineKnown && b.deadlineKnown) return (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0);
        return a.deadlineKnown ? -1 : 1;
      }),
    });
  });

  router.get('/jobs', requirePermission('view_cases'), (_req, res) => {
    res.json({ jobs: jobs.listJobs() });
  });

  return router;
};
