/**
 * Scheduler — explicitly started background worker.
 *
 * On start it (1) recovers any jobs interrupted by a prior crash, then (2)
 * periodically enqueues a poll and drains the queue. Started explicitly from the
 * server entry point (never implicitly as a side effect of importing a module),
 * and disabled by default under tests so test runs stay deterministic.
 */

import type { JobRunner } from './jobRunner.ts';

export interface SchedulerOptions {
  /** Poll interval in ms. 0 disables the periodic poll (manual/on-demand only). */
  intervalMs: number;
  /** Whether to run an initial poll immediately on start. */
  pollOnStart?: boolean;
}

export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly jobs: JobRunner,
    private readonly options: SchedulerOptions,
  ) {}

  /** Start the worker: recover interrupted jobs, then begin periodic polling. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Restart recovery first.
    this.jobs.recoverInterrupted();
    // Drain anything already queued (e.g. recovered jobs).
    await this.jobs.drain();

    if (this.options.pollOnStart) {
      this.jobs.enqueue('poll_denials', {});
      await this.jobs.drain();
    }

    if (this.options.intervalMs > 0) {
      this.timer = setInterval(() => {
        void this.tick();
      }, this.options.intervalMs);
      // Do not keep the process alive solely for the scheduler.
      this.timer.unref?.();
    }
  }

  private async tick(): Promise<void> {
    try {
      this.jobs.enqueue('poll_denials', {});
      await this.jobs.drain();
    } catch {
      /* errors are captured per-job; tick stays alive */
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
  }
}
