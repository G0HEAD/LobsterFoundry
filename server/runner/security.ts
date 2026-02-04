import { createPublicKey, verify } from 'crypto';
import {
  BlueprintEnvelope,
  BlueprintKind,
  EnvelopeAuth,
  LicenseTier,
  School,
} from '../../shared/schema';
import { ValidationError } from './errors';
import { stableStringify } from './hash';
import { RunnerState } from './state';

export interface RunnerSecurityContext {
  state: RunnerState;
  now: string;
}

export interface RunnerSecurity {
  assertEnvelope(envelope: BlueprintEnvelope, context: RunnerSecurityContext): void;
}

export interface SignerRegistry {
  getPublicKey(signerId: string): string | undefined;
  registerSigner(signerId: string, publicKey: string): void;
}

export class InMemorySignerRegistry implements SignerRegistry {
  private keys = new Map<string, string>();

  getPublicKey(signerId: string): string | undefined {
    return this.keys.get(signerId);
  }

  registerSigner(signerId: string, publicKey: string): void {
    this.keys.set(signerId, publicKey);
  }
}

export interface LicenseRequirement {
  school: School;
  min_tier: LicenseTier;
}

export interface SecurityConfig {
  require_signature?: boolean;
  require_known_signer?: boolean;
  require_nonce?: boolean;
  enforce_proposer_match?: boolean;
  require_license?: boolean;
  allow_inline_public_key?: boolean;
  license_requirements?: Partial<Record<BlueprintKind, LicenseRequirement>>;
}

export class SecurityEngine implements RunnerSecurity {
  constructor(private registry: SignerRegistry, private config: SecurityConfig = {}) {}

  assertEnvelope(envelope: BlueprintEnvelope, context: RunnerSecurityContext): void {
    const auth = envelope.auth;

    if (this.config.require_signature && !auth) {
      throw new ValidationError('missing envelope auth');
    }

    if (auth) {
      if (auth.algorithm !== 'ED25519') {
        throw new ValidationError('unsupported signature algorithm');
      }
      if (this.config.require_signature && !auth.signature) {
        throw new ValidationError('signature is required');
      }
      if (this.config.enforce_proposer_match && auth.signer_id !== envelope.proposer_id) {
        throw new ValidationError('signer_id must match proposer_id');
      }

      const registryKey = this.registry.getPublicKey(auth.signer_id);
      const inlineKey = this.config.allow_inline_public_key ? auth.public_key : undefined;
      if (this.config.require_known_signer && !registryKey) {
        throw new ValidationError('unknown signer');
      }

      const publicKey = inlineKey ?? registryKey;
      if (this.config.require_signature && !publicKey) {
        throw new ValidationError('public key is required');
      }

      if (publicKey) {
        this.verifySignature(envelope, auth, publicKey);
      }

      if (this.config.require_nonce) {
        if (!auth.nonce) {
          throw new ValidationError('nonce is required');
        }
        context.state.registerNonce(auth.signer_id, auth.nonce);
      }
    }

    this.assertLicense(envelope, context.state);
  }

  private verifySignature(envelope: BlueprintEnvelope, auth: EnvelopeAuth, publicKey: string): void {
    const canonical = canonicalizeEnvelope(envelope);
    const signature = Buffer.from(auth.signature, 'base64');
    const key = resolvePublicKey(publicKey);
    const ok = verify(null, Buffer.from(canonical), key, signature);
    if (!ok) {
      throw new ValidationError('invalid signature');
    }
  }

  private assertLicense(envelope: BlueprintEnvelope, state: RunnerState): void {
    if (!this.config.require_license) {
      return;
    }

    const requirements = this.config.license_requirements;
    if (!requirements) {
      return;
    }

    const requirement = requirements[envelope.kind];
    if (!requirement) {
      return;
    }

    const account = state.getAccount(envelope.proposer_id);
    if (!account) {
      throw new ValidationError('license check failed: account missing');
    }

    const qualifies = account.licenses.some((license) => {
      if (license.school !== requirement.school) {
        return false;
      }
      return tierRank(license.tier) >= tierRank(requirement.min_tier);
    });

    if (!qualifies) {
      throw new ValidationError('license check failed');
    }
  }
}

export function canonicalizeEnvelope(envelope: BlueprintEnvelope): string {
  const { auth, ...rest } = envelope;
  if (!auth) {
    return stableStringify(rest);
  }
  const { signature, ...authWithoutSig } = auth;
  return stableStringify({ ...rest, auth: authWithoutSig });
}

function resolvePublicKey(publicKey: string) {
  if (publicKey.startsWith('-----BEGIN')) {
    return createPublicKey(publicKey);
  }
  const buffer = Buffer.from(publicKey, 'base64');
  return createPublicKey({ key: buffer, format: 'der', type: 'spki' });
}

function tierRank(tier: LicenseTier): number {
  switch (tier) {
    case LicenseTier.VISITOR:
      return 0;
    case LicenseTier.CITIZEN:
      return 1;
    case LicenseTier.APPRENTICE:
      return 2;
    case LicenseTier.JOURNEYMAN:
      return 3;
    case LicenseTier.MASTER:
      return 4;
    case LicenseTier.ACCREDITED:
      return 5;
    default:
      return 0;
  }
}
