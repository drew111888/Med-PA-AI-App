/**
 * Persistence for patients, claims, denials, and appeal cases.
 *
 * PHI-bearing columns (patient name/mrn/dob, denial raw text) are encrypted at
 * the application layer via crypto.ts before insert and decrypted on read. The
 * appeal_case row stores the full packet JSON (its PHI is the draft letter; it
 * is encrypted as a unit).
 */

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
  createdAt: string;
  updatedAt: string;
}

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

  /** Insert a denial; returns false if a denial with the same externalRef exists. */
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    this.db
      .prepare(
        `UPDATE appeal_cases SET state=?, classification=?, gate_decision=?, packet=?, updated_at=? WHERE id=?`,
      )
      .run(
        state,
        classification ? JSON.stringify(classification) : null,
        gate ? JSON.stringify(gate) : null,
        packet ? encryptField(JSON.stringify(packet), this.encKey) : null,
        new Date().toISOString(),
        id,
      );
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
