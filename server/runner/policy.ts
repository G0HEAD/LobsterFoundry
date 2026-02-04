import { BlueprintEnvelope, CraftPayload, MintEventPayload, Token, TokenType } from '../../shared/schema';
import { ValidationError } from './errors';
import { Ledger } from './ledger';
import { RunnerState } from './state';

export interface CycleWindow {
  id: string;
  start: string;
  end: string;
}

export type CycleProvider = (now: string) => CycleWindow;

export function createDailyCycleProvider(): CycleProvider {
  return (now) => {
    const date = new Date(now);
    if (Number.isNaN(date.getTime())) {
      throw new ValidationError('invalid cycle date');
    }

    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const id = start.toISOString().slice(0, 10);

    return { id, start: start.toISOString(), end: end.toISOString() };
  };
}

export interface RunnerPolicyContext {
  ledger: Ledger;
  state: RunnerState;
  now: string;
}

export interface RunnerPolicy {
  assertMint(
    payload: MintEventPayload,
    envelope: BlueprintEnvelope,
    context: RunnerPolicyContext,
  ): void;
  recordMint(
    payload: MintEventPayload,
    envelope: BlueprintEnvelope,
    minted: Token[],
    context: RunnerPolicyContext,
  ): void;
  assertCraft(
    payload: CraftPayload,
    envelope: BlueprintEnvelope,
    context: RunnerPolicyContext,
  ): void;
}

export interface PolicyConfig {
  mint_caps?: {
    per_settler_per_cycle?: Partial<Record<TokenType, number>>;
    global_per_cycle?: Partial<Record<TokenType, number>>;
  };
  fees?: {
    craft_fee_cc?: number;
  };
  treasury?: {
    weekly_cc?: number;
    tracked_reasons?: string[];
  };
}

export class NoopPolicy implements RunnerPolicy {
  assertMint(): void {}
  recordMint(): void {}
  assertCraft(): void {}
}

export class PolicyEngine implements RunnerPolicy {
  private cycleProvider: CycleProvider;

  constructor(private config: PolicyConfig, options?: { cycleProvider?: CycleProvider }) {
    this.cycleProvider = options?.cycleProvider ?? createDailyCycleProvider();
  }

  assertMint(
    payload: MintEventPayload,
    _envelope: BlueprintEnvelope,
    context: RunnerPolicyContext,
  ): void {
    const cycle = this.cycleProvider(context.now);
    const tokenType = payload.token_type;
    const amount = payload.amount;

    const { globalCount, ownerCount } = this.countMintsInCycle(
      context.state,
      cycle,
      tokenType,
      payload.mint_to,
    );

    const globalCap = this.config.mint_caps?.global_per_cycle?.[tokenType];
    if (typeof globalCap === 'number') {
      if (globalCount + amount > globalCap) {
        throw new ValidationError(`mint cap exceeded for ${tokenType} (global)`);
      }
    }

    const perSettlerCap = this.config.mint_caps?.per_settler_per_cycle?.[tokenType];
    if (typeof perSettlerCap === 'number') {
      if (ownerCount + amount > perSettlerCap) {
        throw new ValidationError(`mint cap exceeded for ${tokenType} (settler)`);
      }
    }
  }

  recordMint(
    _payload: MintEventPayload,
    _envelope: BlueprintEnvelope,
    _minted: Token[],
    _context: RunnerPolicyContext,
  ): void {}

  assertCraft(
    payload: CraftPayload,
    _envelope: BlueprintEnvelope,
    _context: RunnerPolicyContext,
  ): void {
    const requiredFee = this.config.fees?.craft_fee_cc;
    if (typeof requiredFee === 'number' && payload.craft_fee_cc !== requiredFee) {
      throw new ValidationError('craft fee does not match policy');
    }
  }

  private countMintsInCycle(
    state: RunnerState,
    cycle: CycleWindow,
    tokenType: TokenType,
    ownerId: string,
  ): { globalCount: number; ownerCount: number } {
    const startMs = this.parseIso(cycle.start);
    const endMs = this.parseIso(cycle.end);
    const tokens = state.listTokens();

    let globalCount = 0;
    let ownerCount = 0;

    for (const token of tokens) {
      if (token.type !== tokenType) {
        continue;
      }
      const createdMs = this.parseIso(token.created_at);
      if (createdMs < startMs || createdMs >= endMs) {
        continue;
      }
      globalCount += 1;
      if (token.owner_id === ownerId) {
        ownerCount += 1;
      }
    }

    return { globalCount, ownerCount };
  }

  private parseIso(value: string): number {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      throw new ValidationError('invalid ISO timestamp');
    }
    return parsed;
  }
}
