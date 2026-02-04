import { readFile } from 'fs/promises';
import { BlueprintEnvelope } from '../../shared/schema';
import { createDailyCycleProvider, PolicyEngine } from './policy';
import { loadPolicyConfig } from './policy-loader';
import { createWeeklyCycleProvider, TreasuryBudget } from './budget';
import { RunnerFileStore } from './store';
import { RunnerRuntime } from './runtime';
import { runDemo } from './demo';
import { runTests } from './tests';
import { RunnerMaintenance } from './maintenance';
import { SecurityEngine } from './security';
import { loadSecurityConfig } from './security-loader';

const DEFAULT_STORE = 'data/runner-checkpoint.json';

async function buildRuntime(storePath: string) {
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
  const security = new SecurityEngine(securityConfig.registry, securityConfig.config);
  const store = new RunnerFileStore(storePath);
  const runtime = await RunnerRuntime.loadFromStore(store, { policy, budget, security });
  return { runtime, store };
}

function getFlagValue(args: string[], flag: string, fallback?: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return fallback;
  }
  return args[index + 1] ?? fallback;
}

async function commandApply(args: string[]) {
  const filePath = args[1];
  if (!filePath) {
    throw new Error('apply requires a blueprint JSON file path');
  }
  const storePath = getFlagValue(args, '--store', DEFAULT_STORE) ?? DEFAULT_STORE;
  const { runtime, store } = await buildRuntime(storePath);
  const raw = await readFile(filePath, 'utf8');
  const blueprint = JSON.parse(raw) as BlueprintEnvelope;
  const result = runtime.execute(blueprint);
  await runtime.saveToStore(store);
  console.log(JSON.stringify({ event: result.event, minted: result.minted.length, burned: result.burned.length }, null, 2));
}

async function commandLedger(args: string[]) {
  const storePath = getFlagValue(args, '--store', DEFAULT_STORE) ?? DEFAULT_STORE;
  const { runtime } = await buildRuntime(storePath);
  console.log(JSON.stringify(runtime.ledger.getEvents(), null, 2));
}

async function commandState(args: string[]) {
  const storePath = getFlagValue(args, '--store', DEFAULT_STORE) ?? DEFAULT_STORE;
  const { runtime } = await buildRuntime(storePath);
  const snapshot = runtime.state.snapshot();
  const summary = {
    tokens: Object.keys(snapshot.tokens).length,
    accounts: Object.keys(snapshot.accounts).length,
    escrows: Object.keys(snapshot.escrows).length,
    contracts: Object.keys(snapshot.contracts).length,
    submissions: Object.keys(snapshot.submissions).length,
    stamps: Object.keys(snapshot.stamps).length,
    jobs: Object.keys(snapshot.verification_jobs).length,
    stakes: Object.keys(snapshot.stakes).length,
    sanctions: Object.keys(snapshot.sanctions).length,
    appeals: Object.keys(snapshot.appeals).length,
  };
  console.log(JSON.stringify({ summary, snapshot }, null, 2));
}

async function commandDemo() {
  await runDemo();
  console.log('Demo complete');
}

async function commandTests() {
  runTests();
  console.log('Runner tests passed');
}

async function commandMaintain(args: string[]) {
  const storePath = getFlagValue(args, '--store', DEFAULT_STORE) ?? DEFAULT_STORE;
  const { runtime, store } = await buildRuntime(storePath);
  const maintenance = new RunnerMaintenance(runtime.state, runtime.ledger);
  const result = maintenance.run();
  await runtime.saveToStore(store);
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'apply':
      await commandApply(args);
      return;
    case 'ledger':
      await commandLedger(args);
      return;
    case 'state':
      await commandState(args);
      return;
    case 'maintain':
      await commandMaintain(args);
      return;
    case 'demo':
      await commandDemo();
      return;
    case 'tests':
      await commandTests();
      return;
    default:
      throw new Error('unknown command');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
