import { BlueprintEnvelope } from '../../shared/schema';
import { Ledger } from './ledger';
import { ExecutionResult, RunnerKernel, RunnerKernelOptions } from './kernel';
import { RunnerState, StateSnapshot } from './state';
import { RunnerCheckpoint, RunnerFileStore, RUNNER_CHECKPOINT_VERSION } from './store';

export interface RunnerRuntimeOptions extends RunnerKernelOptions {
  checkpointVersion?: string;
}

export class RunnerRuntime {
  readonly ledger: Ledger;
  readonly state: RunnerState;
  readonly kernel: RunnerKernel;
  private checkpointVersion: string;

  constructor(
    ledger?: Ledger,
    state?: RunnerState,
    options?: RunnerRuntimeOptions,
  ) {
    this.ledger = ledger ?? new Ledger();
    this.state = state ?? new RunnerState();
    this.kernel = new RunnerKernel(this.ledger, this.state, options);
    this.checkpointVersion = options?.checkpointVersion ?? RUNNER_CHECKPOINT_VERSION;
  }

  execute(envelope: BlueprintEnvelope): ExecutionResult {
    return this.kernel.execute(envelope);
  }

  rollback(steps = 1): void {
    this.kernel.rollback(steps);
  }

  createCheckpoint(): RunnerCheckpoint {
    return {
      version: this.checkpointVersion,
      saved_at: new Date().toISOString(),
      ledger: this.ledger.getEvents(),
      state: this.state.snapshot(),
      snapshots: this.kernel.exportSnapshots(),
    };
  }

  async saveToStore(store: RunnerFileStore): Promise<void> {
    await store.save(this.createCheckpoint());
  }

  static async loadFromStore(
    store: RunnerFileStore,
    options?: RunnerRuntimeOptions,
  ): Promise<RunnerRuntime> {
    const checkpoint = await store.load();
    if (!checkpoint) {
      return new RunnerRuntime(undefined, undefined, options);
    }

    store.validateLedgerIntegrity(checkpoint);
    const ledger = new Ledger(checkpoint.ledger);
    const state = new RunnerState(checkpoint.state);
    const runtime = new RunnerRuntime(ledger, state, options);
    runtime.kernel.restoreSnapshots(checkpoint.snapshots ?? []);
    return runtime;
  }

  static fromCheckpoint(
    checkpoint: RunnerCheckpoint,
    options?: RunnerRuntimeOptions,
  ): RunnerRuntime {
    const ledger = new Ledger(checkpoint.ledger);
    const state = new RunnerState(checkpoint.state);
    const runtime = new RunnerRuntime(ledger, state, options);
    runtime.kernel.restoreSnapshots(checkpoint.snapshots ?? []);
    return runtime;
  }

  static snapshotFromState(
    ledger: Ledger,
    state: RunnerState,
    snapshots: StateSnapshot[] = [],
    checkpointVersion = RUNNER_CHECKPOINT_VERSION,
  ): RunnerCheckpoint {
    return {
      version: checkpointVersion,
      saved_at: new Date().toISOString(),
      ledger: ledger.getEvents(),
      state: state.snapshot(),
      snapshots,
    };
  }
}
