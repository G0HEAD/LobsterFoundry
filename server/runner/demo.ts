import { readFile } from 'fs/promises';
import {
  BlueprintClass,
  BlueprintEnvelope,
  BlueprintKind,
  ExecutionMode,
  LicenseTier,
  School,
  StampDecision,
  StampRole,
  TokenType,
  TrialZone,
} from '../../shared/schema';
import { hashObject } from './hash';
import { createDailyCycleProvider, PolicyEngine } from './policy';
import { loadPolicyConfig } from './policy-loader';
import { createWeeklyCycleProvider, TreasuryBudget } from './budget';
import { RunnerFileStore } from './store';
import { RunnerRuntime } from './runtime';
import { InMemorySignerRegistry, SecurityEngine } from './security';
import { loadSecurityConfig } from './security-loader';
import { createSignerKeyPair, signEnvelope } from './signing';

const now = () => new Date().toISOString();

function makeBaseEnvelope(proposerId: string, title: string, summary: string): Omit<BlueprintEnvelope, 'kind' | 'payload'> {
  const createdAt = now();
  return {
    id: hashObject({ proposerId, createdAt, title, summary }),
    class: BlueprintClass.C_RUNNER_POLICY,
    irl_min: 0,
    created_at: createdAt,
    proposer_id: proposerId,
    title,
    summary,
    requested_scopes: [],
    funding: {
      escrow_required: false,
      sponsor_id: proposerId,
      escrow_cc_amount: 0,
      fees: { admin_percent: 0, fixed_cc: 0 },
    },
    verification_plan: {
      required_stamps: [],
      conflict_rules: {
        max_pairings_per_cycle: 0,
        disallow_same_maintainer_group: false,
        min_diversity_score: 0,
      },
    },
    execution_plan: {
      mode: ExecutionMode.IMMEDIATE_RUNNER,
      trial_required: false,
      trial_zone: TrialZone.QUARANTINE,
      rollback: { required: true, strategy: 'SNAPSHOT_REVERT' },
    },
    economy_impact: {
      category: 'OTHER',
      crowding_tags: [],
      subsidy_eligibility: 'NONE',
    },
    status: 'SUBMITTED',
  };
}

function makeEnvelope(
  proposerId: string,
  kind: BlueprintKind,
  payload: BlueprintEnvelope['payload'],
  overrides?: Partial<BlueprintEnvelope>,
  signer?: (envelope: BlueprintEnvelope) => BlueprintEnvelope,
): BlueprintEnvelope {
  const base = makeBaseEnvelope(proposerId, `demo-${kind}`, 'runner demo');
  const envelope = { ...base, kind, payload, ...overrides };
  return signer ? signer(envelope) : envelope;
}

async function loadSignerKeys(signerId: string) {
  try {
    const publicRaw = await readFile(`keys/${signerId}.public.json`, 'utf8');
    const privateRaw = await readFile(`keys/${signerId}.private.json`, 'utf8');
    const publicKey = JSON.parse(publicRaw) as { public_key: string };
    const privateKey = JSON.parse(privateRaw) as { private_key: string };
    if (!publicKey.public_key || !privateKey.private_key) {
      return null;
    }
    return {
      publicKeyBase64: publicKey.public_key,
      privateKeyBase64: privateKey.private_key,
    };
  } catch (error) {
    return null;
  }
}

async function ensureSigner(
  signerId: string,
  registry: InMemorySignerRegistry,
  privateKeys: Map<string, string>,
): Promise<void> {
  const existing = await loadSignerKeys(signerId);
  const keyPair = existing ?? createSignerKeyPair();
  registry.registerSigner(signerId, keyPair.publicKeyBase64);
  privateKeys.set(signerId, keyPair.privateKeyBase64);
}

export async function runDemo(): Promise<void> {
  const policyConfig = await loadPolicyConfig('config/policy.json');
  const policy = new PolicyEngine(policyConfig, { cycleProvider: createDailyCycleProvider() });
  const budget = new TreasuryBudget(
    {
      weekly_cc: policyConfig.treasury?.weekly_cc,
      tracked_reasons: policyConfig.treasury?.tracked_reasons,
    },
    { cycleProvider: createWeeklyCycleProvider() },
  );
  const securityConfig = await loadSecurityConfig('config/security.json');
  const registry = securityConfig.registry;
  const privateKeys = new Map<string, string>();
  const signerIds = ['sponsor-001', 'settler-001', 'verifier-001', 'verifier-002', 'verifier-003'];
  for (const signerId of signerIds) {
    await ensureSigner(signerId, registry, privateKeys);
  }
  const security = new SecurityEngine(registry, securityConfig.config);

  const runtime = new RunnerRuntime(undefined, undefined, { policy, budget, security, clock: now });
  runtime.state.applyCcChange('sponsor-001', 250, now(), 'SEED', true);
  runtime.state.applyCcChange('settler-001', 25, now(), 'SEED', true);
  runtime.state.applyCcChange('verifier-001', 15, now(), 'SEED', true);
  runtime.state.applyCcChange('verifier-002', 15, now(), 'SEED', true);
  runtime.state.applyCcChange('verifier-003', 15, now(), 'SEED', true);
  runtime.state.applyCcChange('TREASURY', 1000, now(), 'TREASURY_SEED', true);

  const grantLicense = (accountId: string, school: School, tier: LicenseTier) => {
    const account = runtime.state.ensureAccount(accountId, now(), true);
    const exists = account.licenses.some(
      (license) => license.school === school && license.tier === tier,
    );
    if (exists) {
      return;
    }
    runtime.state.upsertAccount({
      ...account,
      licenses: [
        ...account.licenses,
        {
          school,
          tier,
          granted_at: now(),
          granted_by: 'SYSTEM',
          seals_earned: { bronze: 0, silver: 0, gold: 0 },
        },
      ],
      last_active_at: now(),
    });
  };

  grantLicense('verifier-001', School.VERIFICATION, LicenseTier.APPRENTICE);
  grantLicense('verifier-002', School.VERIFICATION, LicenseTier.APPRENTICE);
  grantLicense('verifier-003', School.VERIFICATION, LicenseTier.APPRENTICE);

  const sign = (envelope: BlueprintEnvelope) => {
    if (!securityConfig.config.require_signature) {
      return envelope;
    }
    const privateKey = privateKeys.get(envelope.proposer_id);
    if (!privateKey) {
      throw new Error(`missing signer key for ${envelope.proposer_id}`);
    }
    return signEnvelope(envelope, {
      signerId: envelope.proposer_id,
      privateKeyBase64: privateKey,
    });
  };

  const contractEnvelope = makeEnvelope(
    'sponsor-001',
    BlueprintKind.QUEST_CONTRACT,
    {
      deliverable_type: 'CRITIQUE_PACKAGE',
      acceptance_criteria: ['clear critique', 'evidence supplied'],
      author_stipend_cc: 10,
      mint_rewards: [
        {
          token_type: TokenType.IRON,
          mint_to: 'AUTHOR',
          amount: 1,
          conditions: ['stamps:QUALITY', 'stamps:EVIDENCE', 'stamps:SAFETY'],
        },
      ],
    },
    {
      funding: {
        escrow_required: true,
        sponsor_id: 'sponsor-001',
        escrow_cc_amount: 110,
        fees: { admin_percent: 0.1, fixed_cc: 0 },
      },
      verification_plan: {
        required_stamps: [
          {
            role: StampRole.QUALITY,
            min_unique: 1,
            eligible_licenses: ['Verifier:T1'],
            stake_cc: 5,
            pay_cc: 25,
            timeout_minutes: 60,
            escalation: [
              { after_minutes: 30, pay_multiplier: 1.1 },
              { after_minutes: 60, pay_multiplier: 1.25 },
            ],
          },
          {
            role: StampRole.EVIDENCE,
            min_unique: 1,
            eligible_licenses: ['Verifier:T1'],
            stake_cc: 5,
            pay_cc: 30,
            timeout_minutes: 60,
            escalation: [
              { after_minutes: 30, pay_multiplier: 1.1 },
              { after_minutes: 60, pay_multiplier: 1.25 },
            ],
          },
          {
            role: StampRole.SAFETY,
            min_unique: 1,
            eligible_licenses: ['Verifier:T1'],
            stake_cc: 10,
            pay_cc: 35,
            timeout_minutes: 60,
            escalation: [
              { after_minutes: 30, pay_multiplier: 1.1 },
              { after_minutes: 60, pay_multiplier: 1.25 },
            ],
          },
        ],
        conflict_rules: {
          max_pairings_per_cycle: 2,
          disallow_same_maintainer_group: true,
          min_diversity_score: 0,
        },
      },
    },
    sign,
  );

  runtime.execute(contractEnvelope);

  const submissionEnvelope = makeEnvelope(
    'settler-001',
    BlueprintKind.WORK_SUBMISSION,
    {
      contract_id: contractEnvelope.id,
      artifacts: [
        { name: 'critique.md', hash: 'hash-critique', uri: 'ipfs://critique', mime_type: 'text/markdown', size_bytes: 1200 },
      ],
      claims: ['refactor improves clarity'],
      requested_mint: [TokenType.IRON],
    },
    undefined,
    sign,
  );

  runtime.execute(submissionEnvelope);

  const jobs = runtime.state.listVerificationJobsBySubmission(submissionEnvelope.id);
  const verifierIds = ['verifier-001', 'verifier-002', 'verifier-003'];

  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    const verifierId = verifierIds[i % verifierIds.length];
    runtime.execute(
      makeEnvelope(
        verifierId,
        BlueprintKind.VERIFICATION_JOB,
        {
          job_id: job.id,
          verifier_id: verifierId,
          stake_cc_locked: job.stake_required_cc,
        },
        undefined,
        sign,
      ),
    );
    runtime.execute(
      makeEnvelope(
        verifierId,
        BlueprintKind.VERIFICATION_STAMP,
        {
          job_id: job.id,
          verifier_id: verifierId,
          decision: StampDecision.PASS,
          checklist_results: [{ item: 'basic checks', passed: true }],
          notes: 'looks good',
          artifacts: [],
          stake_cc_locked: job.stake_required_cc,
        },
        undefined,
        sign,
      ),
    );
  }

  const mintedTokens = runtime.state
    .listTokensByOwner('settler-001')
    .filter((token) => token.type === TokenType.IRON);
  if (mintedTokens.length > 0) {
    runtime.execute(
      makeEnvelope('settler-001', BlueprintKind.CRAFT, {
        recipe_id: 'iron_mug',
        inputs: mintedTokens.map((token) => ({ token_id: token.id })),
        output: { token_template: 'iron_mug', amount: 1 },
        required_license: 'SMITHING:APPRENTICE',
        craft_fee_cc: policyConfig.fees?.craft_fee_cc ?? 2,
      }, undefined, sign),
    );
  }

  runtime.rollback(1);

  const store = new RunnerFileStore('data/runner-checkpoint.json');
  await runtime.saveToStore(store);
}
