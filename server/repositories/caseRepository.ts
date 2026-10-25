/**
 * Persistence for patients, claims, denials, and appeal cases.
 *
 * PHI-bearing columns (patient name/mrn/dob, denial raw text) are encrypted at
 * the application layer via crypto.ts before insert and decrypted on read. The
 * appeal_case row stores the full packet JSON (its PHI is the draft letter; it
 * is encrypted as a unit).
 */

import crypto from 'node:crypto';
import type { Db } from '../db/index.ts';
import { encryptField, decryptField } from '../db/crypto.ts';
import type { Patient, Claim, Denial, AppealCaseState } from '../domain/types.ts';
import type { AppealPacket } from '../domain/packet.ts';
import type { Classification } from '../pipeline/classifier.ts';
import type { GateResult } from '../pipeline/gateEngine.ts';

export interface AppealCaseRow {
  id: string;
  denialId: string;
  state: AppealCaseState;
  classification: Classification | null;
  gate: GateResult | null;
  packet: AppealPacket | null;
  /** Monotonic version of the current packet. Bumps when packet content changes. */
  packetVersion: number;
  /** Content hash of the current packet, used to detect edits. */
  packetHash: string | null;
  /** The packet version that was approved (null if not approved / stale). */
  approvedVersion: number | null;
  approvedBy: string | null;
  approvedAt: string | null;
  /** The packet version a handoff package was generated from. */
  handoffVersion: number | null;
  handoffGeneratedAt: string | null;
  /** True when a handoff artifact exists (content fetched separately). */
  hasHandoff: boolean;
  submittedBy: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Stable content hash of the parts of a packet that gate approval. */
export const hashPacket = (packet: AppealPacket): string => {
  const material = JSON.stringify({
    evidence: packet.evidence,
    draftLetter: packet.draftLetter,
    appealDeadline: packet.appealDeadline,
    appealRoute: packet.appealRoute,
    category: packet.category,
  });
  return crypto.createHash('sha256').update(material).digest('hex');
};

export class CaseRepository {
  constructor(
    private readonly db: Db,
    private readonly encKey: string,
  ) {}

  // --- Patients ---

  upsertPatient(p: Patient): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO patients (id, mrn_enc, name_enc, dob_enc, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET mrn_enc=excluded.mrn_enc, name_enc=excluded.name_enc, dob_enc=excluded.dob_enc`,
      )
      .run(
        p.id,
        encryptField(p.mrn, this.encKey),
        encryptField(p.name, this.encKey),
        p.dob ? encryptField(p.dob, this.encKey) : null,
        now,
      );
  }

  getPatient(id: string): Patient | null {
    const row = this.db.prepare('SELECT * FROM patients WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      mrn: decryptField(row.mrn_enc, this.encKey),
      name: decryptField(row.name_enc, this.encKey),
      dob: row.dob_enc ? decryptField(row.dob_enc, this.encKey) : undefined,
    };
  }

  // --- Claims ---

  upsertClaim(c: Claim): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO claims (id, patient_id, carrier, cpt_codes, date_of_service, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET carrier=excluded.carrier, cpt_codes=excluded.cpt_codes, date_of_service=excluded.date_of_service`,
      )
      .run(c.id, c.patientId, c.carrier, JSON.stringify(c.cptCodes), c.dateOfService, now);
  }

  // --- Denials ---

  /**
   * Insert a denial, idempotent on the denial id. Returns false when a denial
   * with the same externalRef already exists (dedupe on the source system key).
   *
   * On a retry/resume the same denial id can be re-inserted: rather than hitting
   * the PRIMARY KEY constraint, an existing id is upserted (ON CONFLICT(id) DO
   * UPDATE, mirroring upsertPatient/upsertClaim) so the second insert is a no-op
   * update instead of a throw.
   */
  insertDenial(d: Denial): boolean {
    if (d.externalRef) {
      const existing = this.db
        .prepare('SELECT id FROM denials WHERE external_ref = ?')
        .get(d.externalRef);
      if (existing) return false;
    }
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO denials (id, claim_id, source, carrier, carc_codes, rarc_codes, denial_date, raw_text_enc, external_ref, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           claim_id=excluded.claim_id, source=excluded.source, carrier=excluded.carrier,
           carc_codes=excluded.carc_codes, rarc_codes=excluded.rarc_codes,
           denial_date=excluded.denial_date, raw_text_enc=excluded.raw_text_enc,
           external_ref=excluded.external_ref`,
      )
      .run(
        d.id,
        d.claimId,
        d.source,
        d.carrier,
        JSON.stringify(d.carcCodes),
        JSON.stringify(d.rarcCodes),
        d.denialDate,
        d.rawText ? encryptField(d.rawText, this.encKey) : null,
        d.externalRef ?? null,
        now,
      );
    return true;
  }

  // --- Appeal cases ---

  createCase(id: string, denialId: string, state: AppealCaseState): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO appeal_cases (id, denial_id, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, denialId, state, now, now);
  }

  updateCase(
    id: string,
    patch: Partial<{
      state: AppealCaseState;
      classification: Classification;
      gate: GateResult;
      packet: AppealPacket;
    }>,
  ): void {
    const current = this.getCase(id);
    if (!current) throw new Error(`appeal_case ${id} not found`);
    const state = patch.state ?? current.state;
    const classification = patch.classification ?? current.classification;
    const gate = patch.gate ?? current.gate;
    const packet = patch.packet ?? current.packet;

    // Versioning: if the packet content changed, bump the version and hash, and
    // invalidate any prior approval (editing evidence/draft voids approval).
    let packetVersion = current.packetVersion;
    let packetHash = current.packetHash;
    let approvedVersion = current.approvedVersion;
    let approvedBy = current.approvedBy;
    let approvedAt = current.approvedAt;

    if (patch.packet) {
      const newHash = hashPacket(patch.packet);
      if (newHash !== current.packetHash) {
        packetVersion = current.packetVersion + 1;
        packetHash = newHash;
        // A changed packet invalidates a prior approval.
        approvedVersion = null;
        approvedBy = null;
        approvedAt = null;
      }
    }

    this.db
      .prepare(
        `UPDATE appeal_cases
         SET state=?, classification=?, gate_decision=?, packet=?,
             packet_version=?, packet_hash=?,
             approved_version=?, approved_by=?, approved_at=?,
             updated_at=?
         WHERE id=?`,
      )
      .run(
        state,
        classification ? JSON.stringify(classification) : null,
        gate ? JSON.stringify(gate) : null,
        packet ? encryptField(JSON.stringify(packet), this.encKey) : null,
        packetVersion,
        packetHash,
        approvedVersion,
        approvedBy,
        approvedAt,
        new Date().toISOString(),
        id,
      );
  }

  /**
   * Record human approval of a SPECIFIC packet version. Rejects (returns a
   * reason) if the version is stale or the case is not approvable. Idempotent-
   * safe: re-approving the same already-approved version is a conflict.
   */
  approve(id: string, actorUserId: string, expectedVersion: number): { ok: boolean; reason?: string } {
    const c = this.getCase(id);
    if (!c) return { ok: false, reason: 'case not found' };
    if (c.state !== 'packet_ready') {
      return { ok: false, reason: `cannot approve from state ${c.state}` };
    }
    if (expectedVersion !== c.packetVersion) {
      return {
        ok: false,
        reason: `stale approval: expected version ${expectedVersion}, current is ${c.packetVersion}`,
      };
    }
    if (c.approvedVersion === c.packetVersion) {
      return { ok: false, reason: 'already approved' };
    }
    this.db
      .prepare(
        `UPDATE appeal_cases SET state='approved', approved_version=?, approved_by=?, approved_at=?, updated_at=? WHERE id=?`,
      )
      .run(c.packetVersion, actorUserId, new Date().toISOString(), new Date().toISOString(), id);
    return { ok: true };
  }

  /** Store a generated handoff artifact (encrypted) bound to a packet version. */
  saveHandoff(id: string, handoff: unknown, version: number): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE appeal_cases SET state='handoff_generated', handoff_enc=?, handoff_version=?, handoff_generated_at=?, updated_at=? WHERE id=?`,
      )
      .run(encryptField(JSON.stringify(handoff), this.encKey), version, now, now, id);
  }

  getHandoff(id: string): unknown | null {
    const row = this.db.prepare('SELECT handoff_enc FROM appeal_cases WHERE id=?').get(id) as any;
    if (!row?.handoff_enc) return null;
    return JSON.parse(decryptField(row.handoff_enc, this.encKey));
  }

  /** Record a human submission receipt; only this marks a case 'submitted'. */
  recordSubmission(id: string, actorUserId: string, receipt: unknown): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE appeal_cases SET state='submitted', submission_receipt_enc=?, submitted_by=?, submitted_at=?, updated_at=? WHERE id=?`,
      )
      .run(encryptField(JSON.stringify(receipt), this.encKey), actorUserId, now, now, id);
  }

  getSubmissionReceipt(id: string): unknown | null {
    const row = this.db.prepare('SELECT submission_receipt_enc FROM appeal_cases WHERE id=?').get(id) as any;
    if (!row?.submission_receipt_enc) return null;
    return JSON.parse(decryptField(row.submission_receipt_enc, this.encKey));
  }

  getCase(id: string): AppealCaseRow | null {
    const row = this.db.prepare('SELECT * FROM appeal_cases WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapCaseRow(row);
  }

  getCaseByDenial(denialId: string): AppealCaseRow | null {
    const row = this.db
      .prepare('SELECT * FROM appeal_cases WHERE denial_id = ?')
      .get(denialId) as any;
    if (!row) return null;
    return this.mapCaseRow(row);
  }

  listCases(): AppealCaseRow[] {
    const rows = this.db
      .prepare('SELECT * FROM appeal_cases ORDER BY created_at DESC')
      .all() as any[];
    return rows.map((r) => this.mapCaseRow(r));
  }

  private mapCaseRow(row: any): AppealCaseRow {
    return {
      id: row.id,
      denialId: row.denial_id,
      state: row.state,
      classification: row.classification ? JSON.parse(row.classification) : null,
      gate: row.gate_decision ? JSON.parse(row.gate_decision) : null,
      packet: row.packet ? JSON.parse(decryptField(row.packet, this.encKey)) : null,
      packetVersion: Number(row.packet_version ?? 0),
      packetHash: row.packet_hash ?? null,
      approvedVersion: row.approved_version ?? null,
      approvedBy: row.approved_by ?? null,
      approvedAt: row.approved_at ?? null,
      handoffVersion: row.handoff_version ?? null,
      handoffGeneratedAt: row.handoff_generated_at ?? null,
      hasHandoff: Boolean(row.handoff_enc),
      submittedBy: row.submitted_by ?? null,
      submittedAt: row.submitted_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
