/**
 * Case, packet, job, and approval API routes.
 *
 * These back the re-wired UI: list cases, view a packet + evidence, trigger an
 * on-demand run, run a scheduled poll, and record the human approval gate.
 * Approval and submission are explicit, audited actions.
 */

import { Router } from 'express';
import type { Services } from '../services.ts';
import type { EHRPort } from '../ports/ehrPort.ts';
import { intakeDenialFromPdf } from '../intake/denialIntake.ts';
import { buildSubmissionPackage, SubmissionError } from '../submission/submissionHandoff.ts';
import { daysUntil } from '../pipeline/classifier.ts';

export const createCaseRouter = (services: Services, ehr: EHRPort): Router => {
  const router = Router();
  const { cases, audit, jobs, ai } = services;

  // List all appeal cases (summary view).
  router.get('/cases', (_req, res) => {
    const list = cases.listCases().map((c) => ({
      id: c.id,
      denialId: c.denialId,
      state: c.state,
      category: c.classification?.category ?? null,
      appealDeadline: c.classification?.appealDeadline ?? null,
      gateDecision: c.gate?.decision ?? null,
      packetReady: c.state === 'packet_ready' || c.state === 'approved' || c.state === 'submitted',
      updatedAt: c.updatedAt,
    }));
    res.json({ count: list.length, cases: list });
  });

  // Full case detail including the packet.
  router.get('/cases/:id', (req, res) => {
    const c = cases.getCase(req.params.id);
    if (!c) return res.status(404).json({ error: 'case not found' });
    res.json({ case: c, audit: audit.forCase(c.id) });
  });

  // Human approval gate. Transitions packet_ready -> approved and audits it.
  router.post('/cases/:id/approve', (req, res) => {
    const c = cases.getCase(req.params.id);
    if (!c) return res.status(404).json({ error: 'case not found' });
    if (c.state !== 'packet_ready') {
      return res.status(409).json({ error: `cannot approve from state ${c.state}` });
    }
    const actor = (req.body?.actor as string) || 'user';
    cases.updateCase(c.id, { state: 'approved' });
    audit.log({ caseId: c.id, actor, action: 'approved', detail: 'packet approved for submission' });
    res.json({ ok: true, state: 'approved' });
  });

  // On-demand run: enqueue + drain a single denial discovered via the EHR port.
  router.post('/run/denial/:denialId', async (req, res, next) => {
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

  // PDF-fallback intake: normalize a denial from document text and run it
  // through the IDENTICAL pipeline as API-sourced denials.
  router.post('/intake/pdf', async (req, res, next) => {
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

  // Scheduled-style poll run (also invokable on demand).
  router.post('/run/poll', async (req, res, next) => {
    try {
      jobs.enqueue('poll_denials', { since: req.body?.since });
      const processed = await jobs.drain();
      res.json({ processed, cases: cases.listCases().length });
    } catch (err) {
      next(err);
    }
  });

  // Submission handoff for an approved case.
  router.post('/cases/:id/submit', (req, res, next) => {
    try {
      const actor = (req.body?.actor as string) || 'user';
      const pkg = buildSubmissionPackage(cases, audit, req.params.id, actor);
      res.json({ ok: true, state: 'submitted', package: pkg });
    } catch (err) {
      if (err instanceof SubmissionError) {
        return res.status(409).json({ error: err.message });
      }
      next(err);
    }
  });

  // Deadline + status summary for the dashboard.
  router.get('/summary', (_req, res) => {
    const now = new Date().toISOString().slice(0, 10);
    const all = cases.listCases();
    const deadlines = all
      .filter((c) => c.classification?.appealDeadline)
      .map((c) => ({
        caseId: c.id,
        denialId: c.denialId,
        state: c.state,
        appealDeadline: c.classification!.appealDeadline,
        daysRemaining: daysUntil(c.classification!.appealDeadline, now),
      }))
      .sort((a, b) => a.daysRemaining - b.daysRemaining);

    const byState: Record<string, number> = {};
    for (const c of all) byState[c.state] = (byState[c.state] ?? 0) + 1;

    res.json({
      total: all.length,
      byState,
      packetsReady: all.filter((c) => c.state === 'packet_ready').length,
      approved: all.filter((c) => c.state === 'approved').length,
      submitted: all.filter((c) => c.state === 'submitted').length,
      urgentDeadlines: deadlines.filter((d) => d.daysRemaining <= 14 && d.state !== 'submitted'),
      deadlines,
    });
  });

  // Job visibility.
  router.get('/jobs', (_req, res) => {
    res.json({ jobs: jobs.listJobs() });
  });

  return router;
};
