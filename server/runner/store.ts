import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { LedgerEvent } from '../../shared/schema';
import { ValidationError } from './errors';
import { Ledger } from './ledger';
import { StateSnapshot } from './state';

export const RUNNER_CHECKPOINT_VERSION = '0.1.0';

export interface RunnerCheckpoint {
  version: string;
  saved_at: string;
  ledger: LedgerEvent[];
  state: StateSnapshot;
  snapshots?: StateSnapshot[];
}

export class RunnerFileStore {
  constructor(private filePath: string) {}

  async load(): Promise<RunnerCheckpoint | null> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as RunnerCheckpoint;
      this.assertValidCheckpoint(parsed);
      return parsed;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async save(checkpoint: RunnerCheckpoint): Promise<void> {
    this.assertValidCheckpoint(checkpoint);
    await mkdir(dirname(this.filePath), { recursive: true });

    const payload = JSON.stringify(checkpoint, null, 2);
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, payload, 'utf8');
    await rm(this.filePath, { force: true });
    await rename(tempPath, this.filePath);
  }

  validateLedgerIntegrity(checkpoint: RunnerCheckpoint): void {
    const ledger = new Ledger(checkpoint.ledger);
    const report = ledger.verifyIntegrity();
    if (!report.ok) {
      throw new ValidationError('ledger integrity check failed', report.errors);
    }
  }

  private assertValidCheckpoint(checkpoint: RunnerCheckpoint): void {
    if (!checkpoint || typeof checkpoint !== 'object') {
      throw new ValidationError('checkpoint is required');
    }
    if (!checkpoint.version) {
      throw new ValidationError('checkpoint version is required');
    }
    if (!checkpoint.saved_at) {
      throw new ValidationError('checkpoint saved_at is required');
    }
    if (!checkpoint.ledger) {
      throw new ValidationError('checkpoint ledger is required');
    }
    if (!checkpoint.state) {
      throw new ValidationError('checkpoint state is required');
    }
  }
}
