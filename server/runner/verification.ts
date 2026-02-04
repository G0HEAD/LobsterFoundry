import { VerificationJob, VerificationPlan } from '../../shared/schema';
import { ExecutionError, ValidationError } from './errors';
import { hashObject } from './hash';

export class VerificationQueue {
  private jobs: Map<string, VerificationJob> = new Map();

  listJobs(): VerificationJob[] {
    return [...this.jobs.values()];
  }

  listOpenJobs(): VerificationJob[] {
    return this.listJobs().filter((job) => job.status === 'OPEN');
  }

  getJob(jobId: string): VerificationJob | undefined {
    return this.jobs.get(jobId);
  }

  createJobs(
    submissionId: string,
    plan: VerificationPlan,
    eligibleVerifiers: string[],
    now: string,
  ): VerificationJob[] {
    if (!submissionId) {
      throw new ValidationError('submissionId is required');
    }
    if (!plan?.required_stamps?.length) {
      throw new ValidationError('verification plan required_stamps are required');
    }

    const jobs: VerificationJob[] = [];
    for (const requirement of plan.required_stamps) {
      const count = Math.max(1, requirement.min_unique || 1);
      for (let index = 0; index < count; index += 1) {
        const jobId = hashObject({ submissionId, role: requirement.role, index, now });
        const deadline = this.addMinutes(now, requirement.timeout_minutes);

        const job: VerificationJob = {
          id: jobId,
          submission_id: submissionId,
          stamp_role: requirement.role,
          open_to_pool: true,
          eligible_verifiers: eligibleVerifiers,
          base_pay_cc: requirement.pay_cc,
          current_pay_cc: requirement.pay_cc,
          stake_required_cc: requirement.stake_cc,
          created_at: now,
          deadline_at: deadline,
          escalation_history: [],
          status: 'OPEN',
        };

        this.jobs.set(jobId, job);
        jobs.push(job);
      }
    }

    return jobs;
  }

  assignJob(jobId: string, verifierId: string): VerificationJob {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new ExecutionError(`verification job not found: ${jobId}`);
    }
    if (job.status !== 'OPEN') {
      throw new ExecutionError(`verification job not open: ${jobId}`);
    }
    if (job.eligible_verifiers.length > 0 && !job.eligible_verifiers.includes(verifierId)) {
      throw new ExecutionError(`verifier not eligible for job: ${jobId}`);
    }

    const updated: VerificationJob = {
      ...job,
      assigned_to: verifierId,
      status: 'ASSIGNED',
    };

    this.jobs.set(jobId, updated);
    return updated;
  }

  completeJob(jobId: string, stampId: string): VerificationJob {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new ExecutionError(`verification job not found: ${jobId}`);
    }
    if (job.status !== 'ASSIGNED') {
      throw new ExecutionError(`verification job not assigned: ${jobId}`);
    }

    const updated: VerificationJob = {
      ...job,
      status: 'COMPLETED',
      stamp_id: stampId,
    };

    this.jobs.set(jobId, updated);
    return updated;
  }

  escalateJob(jobId: string, multiplier: number, now: string): VerificationJob {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new ExecutionError(`verification job not found: ${jobId}`);
    }
    if (multiplier <= 1) {
      throw new ExecutionError('escalation multiplier must be > 1');
    }

    const updated: VerificationJob = {
      ...job,
      current_pay_cc: Math.ceil(job.base_pay_cc * multiplier),
      escalation_history: [...job.escalation_history, { at: now, multiplier }],
    };

    this.jobs.set(jobId, updated);
    return updated;
  }

  private addMinutes(base: string, minutes: number): string {
    const baseDate = new Date(base);
    if (Number.isNaN(baseDate.getTime())) {
      throw new ValidationError('invalid time for escalation');
    }
    const delta = minutes * 60 * 1000;
    return new Date(baseDate.getTime() + delta).toISOString();
  }
}
