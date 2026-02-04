import { ValidationError } from './errors';
import { Ledger } from './ledger';
import { TREASURY_ACCOUNT_ID } from './constants';

export interface CycleWindow {
  id: string;
  start: string;
  end: string;
}

export type CycleProvider = (now: string) => CycleWindow;

export function createWeeklyCycleProvider(): CycleProvider {
  return (now) => {
    const date = new Date(now);
    if (Number.isNaN(date.getTime())) {
      throw new ValidationError('invalid cycle date');
    }

    const day = date.getUTCDay();
    const diff = (day + 6) % 7;
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - diff));
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const id = `${start.toISOString().slice(0, 10)}:weekly`;

    return { id, start: start.toISOString(), end: end.toISOString() };
  };
}

export interface TreasuryBudgetConfig {
  weekly_cc?: number;
  tracked_reasons?: string[];
}

export class TreasuryBudget {
  private cycleProvider: CycleProvider;
  private trackedReasons: Set<string>;

  constructor(private config: TreasuryBudgetConfig, options?: { cycleProvider?: CycleProvider }) {
    this.cycleProvider = options?.cycleProvider ?? createWeeklyCycleProvider();
    this.trackedReasons = new Set(config.tracked_reasons ?? ['AUDIT_PAY']);
  }

  assertCanSpend(amount: number, now: string, ledger: Ledger): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }
    const cap = this.config.weekly_cc;
    if (cap === undefined || cap === null || cap <= 0) {
      return;
    }

    const cycle = this.cycleProvider(now);
    const spent = this.computeSpent(ledger, cycle);
    if (spent + amount > cap) {
      throw new ValidationError('treasury weekly cap exceeded');
    }
  }

  private computeSpent(ledger: Ledger, cycle: CycleWindow): number {
    const startMs = Date.parse(cycle.start);
    const endMs = Date.parse(cycle.end);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      throw new ValidationError('invalid cycle window');
    }

    let total = 0;
    for (const event of ledger.getEvents()) {
      const eventMs = Date.parse(event.timestamp);
      if (Number.isNaN(eventMs) || eventMs < startMs || eventMs >= endMs) {
        continue;
      }

      for (const change of event.cc_changes ?? []) {
        if (change.account_id !== TREASURY_ACCOUNT_ID) {
          continue;
        }
        if (change.delta >= 0) {
          continue;
        }
        if (this.trackedReasons.size > 0 && !this.trackedReasons.has(change.reason)) {
          continue;
        }
        total += Math.abs(change.delta);
      }
    }
    return total;
  }
}
