/**
 * Service graph wiring.
 *
 * Builds the repositories, AI provider (through the de-id choke point), and job
 * runner from config + ports. Single place the backend assembles its runtime
 * services, so routes and the server entry share one construction path.
 */

import type { AppConfig } from './config.ts';
import type { Db } from './db/index.ts';
import type { Ports } from './adapters/registry.ts';
import { CaseRepository } from './repositories/caseRepository.ts';
import { AuditRepository } from './repositories/auditRepository.ts';
import { resolveAiProvider, type AiRegistryOptions } from './ai/registry.ts';
import { JobRunner } from './jobs/jobRunner.ts';
import type { OrchestratorDeps } from './pipeline/orchestrator.ts';
import type { AiProviderPort } from './ports/aiProviderPort.ts';

export interface Services {
  cases: CaseRepository;
  audit: AuditRepository;
  ai: AiProviderPort;
  jobs: JobRunner;
  orchestratorDeps: OrchestratorDeps;
}

export const buildServices = (
  config: AppConfig,
  db: Db,
  ports: Ports,
  aiOptions: AiRegistryOptions = {},
): Services => {
  const cases = new CaseRepository(db, config.dbEncryptionKey);
  const audit = new AuditRepository(db);
  const ai = resolveAiProvider(config, aiOptions);

  const orchestratorDeps: OrchestratorDeps = {
    ehr: ports.ehr,
    payerPolicy: ports.payerPolicy,
    ai,
    cases,
    audit,
  };

  const jobs = new JobRunner(db, orchestratorDeps, audit);

  return { cases, audit, ai, jobs, orchestratorDeps };
};
