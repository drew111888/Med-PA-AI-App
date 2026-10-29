/**
 * Startup recovery — one-shot, unconditional boot-time job recovery.
 *
 * Runs ONCE at boot, independent of the periodic scheduler and regardless of
 * whether the periodic scheduler is enabled. It requeues jobs left 'running' by
 * a prior crash (recoverInterrupted) and then drains the queue so any recovered
 * (or already-queued) work resumes immediately under idempotency. It is a safe
 * no-op when nothing is stuck: recoverInterrupted returns 0 and drain processes
 * nothing, creating no rows and advancing no state.
 *
 * The periodic scheduler (server/jobs/scheduler.ts) no longer performs recovery,
 * so there is exactly one recovery pass per boot and no double-recovery.
 *
 * Author / Prepared by: Anthony LaVear
 * Title: Lead BSA, SDIT Architecture
 */

import type { Services } from '../services.ts';

export const runStartupRecovery = async (
  services: Pick<Services, 'jobs'>,
): Promise<{ recovered: number; drained: number }> => {
  const recovered = services.jobs.recoverInterrupted();
  const drained = await services.jobs.drain();
  return { recovered, drained };
};
