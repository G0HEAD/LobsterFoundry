import { LedgerEvent } from '../../shared/schema';
import { Ledger } from './ledger';
import { RunnerState } from './state';
import { ExecutionError } from './errors';

export interface MaintenanceResult {
  escalated_jobs: number;
  expired_jobs: number;
  stake_releases: number;
  events: LedgerEvent[];
}

export class RunnerMaintenance {
  constructor(private state: RunnerState, private ledger: Ledger) {}

  run(now = new Date().toISOString()): MaintenanceResult {
    const events: LedgerEvent[] = [];
    let escalated = 0;
    let expired = 0;
    let stakeReleases = 0;

    const jobs = this.state.listVerificationJobs();
    for (const job of jobs) {
      if (job.status === 'COMPLETED' || job.status === 'EXPIRED') {
        continue;
      }

      const nowMs = Date.parse(now);
      if (Number.isNaN(nowMs)) {
        throw new ExecutionError('invalid maintenance timestamp');
      }

      const deadlineMs = Date.parse(job.deadline_at);
      if (!Number.isNaN(deadlineMs) && nowMs > deadlineMs) {
        const updated = { ...job, status: 'EXPIRED' as const };
        this.state.updateVerificationJob(updated);
        expired += 1;

        if (job.assigned_to) {
          const existing = this.state.getStakeLockForJob(job.id, job.assigned_to);
          if (existing && existing.status === 'LOCKED') {
            const release = this.state.releaseStake(job.id, job.assigned_to, now, 'STAKE_RELEASE');
            if (release.cc_changes.length > 0) {
              const event = this.ledger.append({
                timestamp: now,
                type: 'STAKE_RELEASE',
                actor_id: job.assigned_to,
                cc_changes: release.cc_changes,
              });
              events.push(event);
              stakeReleases += 1;
            }
          }
        }
        continue;
      }

      const requirement = this.getRequirement(job.submission_id, job.stamp_role);
      if (!requirement || !requirement.escalation?.length) {
        continue;
      }

      const createdMs = Date.parse(job.created_at);
      if (Number.isNaN(createdMs)) {
        continue;
      }

      let nextPay = job.current_pay_cc;
      const history = [...job.escalation_history];
      for (const escalation of requirement.escalation) {
        const threshold = createdMs + escalation.after_minutes * 60 * 1000;
        if (nowMs < threshold) {
          continue;
        }
        const alreadyApplied = history.some((entry) => entry.multiplier === escalation.pay_multiplier);
        if (alreadyApplied) {
          continue;
        }
        history.push({ at: now, multiplier: escalation.pay_multiplier });
        const candidate = Math.ceil(job.base_pay_cc * escalation.pay_multiplier);
        if (candidate > nextPay) {
          nextPay = candidate;
        }
      }

      if (history.length !== job.escalation_history.length || nextPay !== job.current_pay_cc) {
        this.state.updateVerificationJob({
          ...job,
          current_pay_cc: nextPay,
          escalation_history: history,
        });
        escalated += 1;
      }
    }

    return {
      escalated_jobs: escalated,
      expired_jobs: expired,
      stake_releases: stakeReleases,
      events,
    };
  }

  private getRequirement(submissionId: string, role: string) {
    const submission = this.state.getSubmission(submissionId);
    if (!submission) {
      return undefined;
    }
    const contract = this.state.getContract(submission.contract_id);
    if (!contract) {
      return undefined;
    }
    return contract.verification_plan.required_stamps.find((req) => req.role === role);
  }
}
