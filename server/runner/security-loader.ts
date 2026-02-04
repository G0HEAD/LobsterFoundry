import { readFile } from 'fs/promises';
import { BlueprintKind, LicenseTier, School } from '../../shared/schema';
import { ValidationError } from './errors';
import { InMemorySignerRegistry, LicenseRequirement, SecurityConfig } from './security';

interface RawLicenseRequirement {
  school: string;
  min_tier: string;
}

interface RawSecurityConfig {
  require_signature?: boolean;
  require_known_signer?: boolean;
  require_nonce?: boolean;
  enforce_proposer_match?: boolean;
  require_license?: boolean;
  allow_inline_public_key?: boolean;
  signers?: { signer_id: string; public_key: string }[];
  license_requirements?: Record<string, RawLicenseRequirement>;
}

function parseLicenseRequirement(raw: RawLicenseRequirement): LicenseRequirement {
  if (!Object.values(School).includes(raw.school as School)) {
    throw new ValidationError('invalid license requirement school');
  }
  if (!Object.values(LicenseTier).includes(raw.min_tier as LicenseTier)) {
    throw new ValidationError('invalid license requirement tier');
  }
  return { school: raw.school as School, min_tier: raw.min_tier as LicenseTier };
}

export async function loadSecurityConfig(filePath: string): Promise<{
  config: SecurityConfig;
  registry: InMemorySignerRegistry;
}> {
  const registry = new InMemorySignerRegistry();
  let rawConfig: RawSecurityConfig = {};

  try {
    const raw = await readFile(filePath, 'utf8');
    rawConfig = JSON.parse(raw) as RawSecurityConfig;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { config: { enforce_proposer_match: true }, registry };
    }
    throw error;
  }

  for (const signer of rawConfig.signers ?? []) {
    if (!signer.signer_id || !signer.public_key) {
      throw new ValidationError('invalid signer entry');
    }
    registry.registerSigner(signer.signer_id, signer.public_key);
  }

  const licenseRequirements: Partial<Record<BlueprintKind, LicenseRequirement>> = {};
  for (const [kind, requirement] of Object.entries(rawConfig.license_requirements ?? {})) {
    if (!Object.values(BlueprintKind).includes(kind as BlueprintKind)) {
      throw new ValidationError('invalid blueprint kind in license requirements');
    }
    licenseRequirements[kind as BlueprintKind] = parseLicenseRequirement(requirement);
  }

  return {
    config: {
      require_signature: rawConfig.require_signature ?? false,
      require_known_signer: rawConfig.require_known_signer ?? false,
      require_nonce: rawConfig.require_nonce ?? false,
      enforce_proposer_match: rawConfig.enforce_proposer_match ?? true,
      require_license: rawConfig.require_license ?? false,
      allow_inline_public_key: rawConfig.allow_inline_public_key ?? false,
      license_requirements: licenseRequirements,
    },
    registry,
  };
}
