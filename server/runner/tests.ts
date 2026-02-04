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
import {
  createDailyCycleProvider,
  createSignerKeyPair,
  InMemorySignerRegistry,
  PolicyEngine,
  RunnerRuntime,
  SecurityEngine,
  signEnvelope,
} from './index';
import { createWeeklyCycleProvider, TreasuryBudget } from './budget';

function createClock(start: string) {
  let time = new Date(start).getTime();
  return () => {
    const value = new Date(time).toISOString();
    time += 1000;
    return value;
  };
}

let idCounter = 0;
let envelopeSigner: ((envelope: BlueprintEnvelope) => BlueprintEnvelope) | null = null;

function makeBaseEnvelope(
  proposerId: string,
  title: string,
  summary: string,
  createdAt: string,
): Omit<BlueprintEnvelope, 'kind' | 'payload'> {
  const sequence = idCounter++;
  return {
    id: `${proposerId}:${createdAt}:${title}:${sequence}`,
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
  now: string,
  overrides?: Partial<BlueprintEnvelope>,
): BlueprintEnvelope {
  const base = makeBaseEnvelope(proposerId, `test-${kind}`, 'runner test', now);
  const envelope = { ...base, kind, payload, ...overrides };
  return envelopeSigner ? envelopeSigner(envelope) : envelope;
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function expectThrows(fn: () => void, message: string) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

export function runTests(): void {
  const signerRegistry = new InMemorySignerRegistry();
  const signerKeys = new Map<string, string>();
  const registerSigner = (signerId: string) => {
    const keyPair = createSignerKeyPair();
    signerRegistry.registerSigner(signerId, keyPair.publicKeyBase64);
    signerKeys.set(signerId, keyPair.privateKeyBase64);
  };
  ['sponsor', 'author', 'verifier-a', 'verifier-b', 'verifier-c'].forEach(registerSigner);

  envelopeSigner = (envelope) => {
    const privateKey = signerKeys.get(envelope.proposer_id);
    if (!privateKey) {
      throw new Error(`missing signer key for ${envelope.proposer_id}`);
    }
    return signEnvelope(envelope, {
      signerId: envelope.proposer_id,
      privateKeyBase64: privateKey,
    });
  };

  const security = new SecurityEngine(signerRegistry, {
    require_signature: true,
    require_known_signer: true,
    require_nonce: true,
    enforce_proposer_match: true,
    require_license: true,
    allow_inline_public_key: false,
    license_requirements: {
      [BlueprintKind.VERIFICATION_JOB]: {
        school: School.VERIFICATION,
        min_tier: LicenseTier.APPRENTICE,
      },
      [BlueprintKind.VERIFICATION_STAMP]: {
        school: School.VERIFICATION,
        min_tier: LicenseTier.APPRENTICE,
      },
      [BlueprintKind.SANCTION]: {
        school: School.MODERATION,
        min_tier: LicenseTier.JOURNEYMAN,
      },
    },
  });

  const clock = createClock('2026-02-03T00:00:00.000Z');
  const policy = new PolicyEngine(
    {
      mint_caps: {
        per_settler_per_cycle: { [TokenType.IRON]: 10 },
        global_per_cycle: { [TokenType.IRON]: 1000 },
      },
      fees: { craft_fee_cc: 2 },
    },
    { cycleProvider: createDailyCycleProvider() },
  );

  const budget = new TreasuryBudget(
    { weekly_cc: 1000, tracked_reasons: ['AUDIT_PAY'] },
    { cycleProvider: createWeeklyCycleProvider() },
  );
  const runtime = new RunnerRuntime(undefined, undefined, { policy, budget, clock, security });
  const now = clock();

  runtime.state.applyCcChange('sponsor', 300, now, 'SEED', true);
  runtime.state.applyCcChange('author', 0, now, 'SEED', true);
  runtime.state.applyCcChange('verifier-a', 10, now, 'SEED', true);
  runtime.state.applyCcChange('verifier-b', 10, now, 'SEED', true);
  runtime.state.applyCcChange('verifier-c', 10, now, 'SEED', true);
  runtime.state.applyCcChange('TREASURY', 1000, now, 'SEED', true);

  const grantLicense = (accountId: string, school: School, tier: LicenseTier) => {
    const account = runtime.state.ensureAccount(accountId, now, true);
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
          granted_at: now,
          granted_by: 'SYSTEM',
          seals_earned: { bronze: 0, silver: 0, gold: 0 },
        },
      ],
      last_active_at: now,
    });
  };

  ['verifier-a', 'verifier-b', 'verifier-c'].forEach((id) =>
    grantLicense(id, School.VERIFICATION, LicenseTier.APPRENTICE),
  );
  grantLicense('sponsor', School.MODERATION, LicenseTier.JOURNEYMAN);

  const contract = makeEnvelope(
    'sponsor',
    BlueprintKind.QUEST_CONTRACT,
    {
      deliverable_type: 'CRITIQUE_PACKAGE',
      acceptance_criteria: ['clear critique'],
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
    now,
    {
      funding: {
        escrow_required: true,
        sponsor_id: 'sponsor',
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
            escalation: [],
          },
          {
            role: StampRole.EVIDENCE,
            min_unique: 1,
            eligible_licenses: ['Verifier:T1'],
            stake_cc: 5,
            pay_cc: 30,
            timeout_minutes: 60,
            escalation: [],
          },
          {
            role: StampRole.SAFETY,
            min_unique: 1,
            eligible_licenses: ['Verifier:T1'],
            stake_cc: 10,
            pay_cc: 35,
            timeout_minutes: 60,
            escalation: [],
          },
        ],
        conflict_rules: {
          max_pairings_per_cycle: 2,
          disallow_same_maintainer_group: true,
          min_diversity_score: 0,
        },
      },
    },
  );

  runtime.execute(contract);

  const escrow = runtime.state.getEscrow(contract.id);
  assert(escrow?.balance_cc === 110, 'escrow should be funded');

  const submission = makeEnvelope(
    'author',
    BlueprintKind.WORK_SUBMISSION,
    {
      contract_id: contract.id,
      artifacts: [
        {
          name: 'critique.md',
          hash: 'hash-critique',
          uri: 'ipfs://critique',
          mime_type: 'text/markdown',
          size_bytes: 1200,
        },
      ],
      claims: ['clarity improved'],
      requested_mint: [TokenType.IRON],
    },
    now,
  );

  runtime.execute(submission);
  const jobs = runtime.state.listVerificationJobsBySubmission(submission.id);
  assert(jobs.length === 3, 'expected 3 verification jobs');

  const verifiers = ['verifier-a', 'verifier-b', 'verifier-c'];
  jobs.forEach((job, index) => {
    const verifier = verifiers[index];
    runtime.execute(
      makeEnvelope(
        verifier,
        BlueprintKind.VERIFICATION_JOB,
        { job_id: job.id, verifier_id: verifier, stake_cc_locked: job.stake_required_cc },
        now,
      ),
    );
    runtime.execute(
      makeEnvelope(
        verifier,
        BlueprintKind.VERIFICATION_STAMP,
        {
          job_id: job.id,
          verifier_id: verifier,
          decision: StampDecision.PASS,
          checklist_results: [{ item: 'ok', passed: true }],
          notes: 'pass',
          artifacts: [],
          stake_cc_locked: job.stake_required_cc,
        },
        now,
      ),
    );
  });

  const minted = runtime.state.listTokensByOwner('author');
  assert(minted.length === 1, 'author should have 1 minted token');
  assert(minted[0].proof_refs.includes('hash-critique'), 'token provenance should include artifact hash');
  assert(minted[0].stamp_ids.length === 3, 'token should reference 3 stamps');

  const remainingEscrow = runtime.state.getEscrow(contract.id);
  assert(remainingEscrow?.balance_cc === 1, 'escrow should retain remainder');

  const contract2 = makeEnvelope(
    'sponsor',
    BlueprintKind.QUEST_CONTRACT,
    {
      deliverable_type: 'CRITIQUE_PACKAGE',
      acceptance_criteria: ['clear critique'],
      author_stipend_cc: 0,
      mint_rewards: [
        {
          token_type: TokenType.IRON,
          mint_to: 'AUTHOR',
          amount: 1,
          conditions: ['stamps:QUALITY', 'stamps:EVIDENCE', 'stamps:SAFETY'],
        },
      ],
    },
    now,
    {
      funding: {
        escrow_required: true,
        sponsor_id: 'sponsor',
        escrow_cc_amount: 100,
        fees: { admin_percent: 0, fixed_cc: 0 },
      },
      verification_plan: {
        required_stamps: [
          {
            role: StampRole.QUALITY,
            min_unique: 1,
            eligible_licenses: ['Verifier:T1'],
            stake_cc: 1,
            pay_cc: 10,
            timeout_minutes: 60,
            escalation: [],
          },
          {
            role: StampRole.EVIDENCE,
            min_unique: 1,
            eligible_licenses: ['Verifier:T1'],
            stake_cc: 1,
            pay_cc: 10,
            timeout_minutes: 60,
            escalation: [],
          },
          {
            role: StampRole.SAFETY,
            min_unique: 1,
            eligible_licenses: ['Verifier:T1'],
            stake_cc: 1,
            pay_cc: 10,
            timeout_minutes: 60,
            escalation: [],
          },
        ],
        conflict_rules: {
          max_pairings_per_cycle: 2,
          disallow_same_maintainer_group: true,
          min_diversity_score: 0,
        },
      },
    },
  );

  runtime.execute(contract2);

  const submission2 = makeEnvelope(
    'author',
    BlueprintKind.WORK_SUBMISSION,
    {
      contract_id: contract2.id,
      artifacts: [
        {
          name: 'critique.md',
          hash: 'hash-critique-2',
          uri: 'ipfs://critique-2',
          mime_type: 'text/markdown',
          size_bytes: 800,
        },
      ],
      claims: ['clarity improved'],
      requested_mint: [TokenType.IRON],
    },
    now,
  );

  runtime.execute(submission2);
  const jobs2 = runtime.state.listVerificationJobsBySubmission(submission2.id).slice(0, 2);
  jobs2.forEach((job, index) => {
    const verifier = verifiers[index];
    runtime.execute(
      makeEnvelope(
        verifier,
        BlueprintKind.VERIFICATION_JOB,
        { job_id: job.id, verifier_id: verifier, stake_cc_locked: job.stake_required_cc },
        now,
      ),
    );
    runtime.execute(
      makeEnvelope(
        verifier,
        BlueprintKind.VERIFICATION_STAMP,
        {
          job_id: job.id,
          verifier_id: verifier,
          decision: StampDecision.PASS,
          checklist_results: [{ item: 'ok', passed: true }],
          notes: 'pass',
          artifacts: [],
          stake_cc_locked: job.stake_required_cc,
        },
        now,
      ),
    );
  });

  const mintedAfter = runtime.state.listTokensByOwner('author');
  assert(mintedAfter.length === 1, 'author should not mint without all stamps');

  const pendingJobs = runtime.state
    .listVerificationJobsBySubmission(submission2.id)
    .filter((job) => job.status === 'OPEN');
  const jobToSlash = pendingJobs[0];
  const treasuryBefore = runtime.state.getAccount('TREASURY')?.cc_balance ?? 0;
  if (jobToSlash) {
    const verifier = 'verifier-c';
    runtime.execute(
      makeEnvelope(
        verifier,
        BlueprintKind.VERIFICATION_JOB,
        { job_id: jobToSlash.id, verifier_id: verifier, stake_cc_locked: jobToSlash.stake_required_cc },
        now,
      ),
    );

    runtime.execute(
      makeEnvelope(
        'sponsor',
        BlueprintKind.SANCTION,
        {
          target_type: 'STAKE',
          target_id: `${jobToSlash.id}:${verifier}`,
          action: 'SLASH',
          reason: 'malpractice',
          amount_cc: jobToSlash.stake_required_cc,
          recipient_id: 'TREASURY',
        },
        now,
      ),
    );

    const stake = runtime.state.getStakeLockForJob(jobToSlash.id, verifier);
    assert(stake?.status === 'SLASHED', 'stake should be slashed');
    const treasuryAfter = runtime.state.getAccount('TREASURY')?.cc_balance ?? 0;
    assert(treasuryAfter > treasuryBefore, 'treasury should receive slashed stake');
  }

  const auditClock = createClock('2026-02-03T12:00:00.000Z');
  const auditPolicy = new PolicyEngine(
    {
      mint_caps: {
        per_settler_per_cycle: { [TokenType.IRON]: 10 },
        global_per_cycle: { [TokenType.IRON]: 1000 },
      },
      fees: { craft_fee_cc: 2 },
    },
    { cycleProvider: createDailyCycleProvider() },
  );
  const auditBudget = new TreasuryBudget(
    { weekly_cc: 1, tracked_reasons: ['AUDIT_PAY'] },
    { cycleProvider: createWeeklyCycleProvider() },
  );
  const auditRuntime = new RunnerRuntime(undefined, undefined, {
    policy: auditPolicy,
    budget: auditBudget,
    clock: auditClock,
    security,
  });
  const auditNow = auditClock();
  auditRuntime.state.applyCcChange('sponsor', 200, auditNow, 'SEED', true);
  auditRuntime.state.applyCcChange('author', 0, auditNow, 'SEED', true);
  auditRuntime.state.applyCcChange('verifier-a', 10, auditNow, 'SEED', true);
  auditRuntime.state.applyCcChange('TREASURY', 1000, auditNow, 'SEED', true);

  const auditVerifier = auditRuntime.state.ensureAccount('verifier-a', auditNow, true);
  auditRuntime.state.upsertAccount({
    ...auditVerifier,
    licenses: [
      ...auditVerifier.licenses,
      {
        school: School.VERIFICATION,
        tier: LicenseTier.APPRENTICE,
        granted_at: auditNow,
        granted_by: 'SYSTEM',
        seals_earned: { bronze: 0, silver: 0, gold: 0 },
      },
    ],
    last_active_at: auditNow,
  });

  const auditContract = makeEnvelope(
    'sponsor',
    BlueprintKind.QUEST_CONTRACT,
    {
      deliverable_type: 'CRITIQUE_PACKAGE',
      acceptance_criteria: ['clear critique'],
      author_stipend_cc: 0,
      mint_rewards: [
        {
          token_type: TokenType.IRON,
          mint_to: 'AUTHOR',
          amount: 1,
          conditions: ['stamps:QUALITY'],
        },
      ],
    },
    auditNow,
    {
      funding: {
        escrow_required: true,
        sponsor_id: 'sponsor',
        escrow_cc_amount: 50,
        fees: { admin_percent: 0, fixed_cc: 0 },
      },
      verification_plan: {
        required_stamps: [
          {
            role: StampRole.QUALITY,
            min_unique: 1,
            eligible_licenses: ['Verifier:T1'],
            stake_cc: 1,
            pay_cc: 10,
            timeout_minutes: 60,
            escalation: [],
          },
        ],
        conflict_rules: {
          max_pairings_per_cycle: 2,
          disallow_same_maintainer_group: true,
          min_diversity_score: 0,
        },
        sampling_audit: {
          enabled: true,
          rate: 1,
          audit_pay_cc: 10,
        },
      },
    },
  );

  auditRuntime.execute(auditContract);
  const auditSubmission = makeEnvelope(
    'author',
    BlueprintKind.WORK_SUBMISSION,
    {
      contract_id: auditContract.id,
      artifacts: [
        {
          name: 'audit.md',
          hash: 'hash-audit',
          uri: 'ipfs://audit',
          mime_type: 'text/markdown',
          size_bytes: 200,
        },
      ],
      claims: ['audit-ready'],
      requested_mint: [TokenType.IRON],
    },
    auditNow,
  );

  auditRuntime.execute(auditSubmission);
  const auditJobs = auditRuntime.state.listVerificationJobsBySubmission(auditSubmission.id);
  const primaryJob = auditJobs.find((job) => job.stamp_role === StampRole.QUALITY);
  if (!primaryJob) {
    throw new Error('missing primary audit job');
  }
  auditRuntime.execute(
    makeEnvelope(
      'verifier-a',
      BlueprintKind.VERIFICATION_JOB,
      { job_id: primaryJob.id, verifier_id: 'verifier-a', stake_cc_locked: primaryJob.stake_required_cc },
      auditNow,
    ),
  );
  auditRuntime.execute(
    makeEnvelope(
      'verifier-a',
      BlueprintKind.VERIFICATION_STAMP,
      {
        job_id: primaryJob.id,
        verifier_id: 'verifier-a',
        decision: StampDecision.PASS,
        checklist_results: [{ item: 'ok', passed: true }],
        notes: 'pass',
        artifacts: [],
        stake_cc_locked: primaryJob.stake_required_cc,
      },
      auditNow,
    ),
  );

  const auditJob = auditRuntime.state
    .listVerificationJobsBySubmission(auditSubmission.id)
    .find((job) => job.stamp_role === StampRole.AUDIT);

  if (!auditJob) {
    throw new Error('missing audit job');
  }

  auditRuntime.execute(
    makeEnvelope(
      'verifier-a',
      BlueprintKind.VERIFICATION_JOB,
      { job_id: auditJob.id, verifier_id: 'verifier-a', stake_cc_locked: 0 },
      auditNow,
    ),
  );

  expectThrows(
    () => {
      auditRuntime.execute(
        makeEnvelope(
          'verifier-a',
          BlueprintKind.VERIFICATION_STAMP,
          {
            job_id: auditJob.id,
            verifier_id: 'verifier-a',
            decision: StampDecision.PASS,
            checklist_results: [{ item: 'audit', passed: true }],
            notes: 'audit pass',
            artifacts: [],
            stake_cc_locked: 0,
          },
          auditNow,
        ),
      );
    },
    'audit payout should fail when treasury budget exceeded',
  );
}
