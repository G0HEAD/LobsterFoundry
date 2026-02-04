import { readFile } from 'fs/promises';
import { TokenType } from '../../shared/schema';
import { ValidationError } from './errors';
import { PolicyConfig } from './policy';

interface RawPolicyConfig {
  mint_caps?: {
    per_settler_per_cycle?: Record<string, number>;
    global_per_cycle?: Record<string, number>;
  };
  fees?: {
    craft_fee_cc?: number;
  };
  treasury?: {
    subsidy_caps?: {
      weekly_cc?: number;
    };
    tracked_reasons?: string[];
  };
}

function mapCaps(source?: Record<string, number>): Partial<Record<TokenType, number>> | undefined {
  if (!source) {
    return undefined;
  }

  const mapped: Partial<Record<TokenType, number>> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!Object.values(TokenType).includes(key as TokenType)) {
      continue;
    }
    if (typeof value !== 'number') {
      throw new ValidationError(`invalid mint cap value for ${key}`);
    }
    mapped[key as TokenType] = value;
  }

  return mapped;
}

export async function loadPolicyConfig(filePath: string): Promise<PolicyConfig> {
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as RawPolicyConfig;

  return {
    mint_caps: {
      per_settler_per_cycle: mapCaps(parsed.mint_caps?.per_settler_per_cycle),
      global_per_cycle: mapCaps(parsed.mint_caps?.global_per_cycle),
    },
    fees: {
      craft_fee_cc: parsed.fees?.craft_fee_cc,
    },
    treasury: {
      weekly_cc: parsed.treasury?.subsidy_caps?.weekly_cc,
      tracked_reasons: parsed.treasury?.tracked_reasons,
    },
  };
}
