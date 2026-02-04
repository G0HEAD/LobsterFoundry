import { LedgerEvent } from '../../shared/schema';
import { hashObject } from './hash';

export interface LedgerEventDraft
  extends Omit<LedgerEvent, 'id' | 'timestamp' | 'prev_hash' | 'event_hash'> {
  id?: string;
  timestamp?: string;
}

export interface LedgerIntegrityReport {
  ok: boolean;
  errors: string[];
}

function stripEventHash(event: LedgerEvent): Omit<LedgerEvent, 'event_hash'> {
  const { event_hash, ...rest } = event;
  return rest;
}

export class Ledger {
  private events: LedgerEvent[] = [];

  constructor(initialEvents?: LedgerEvent[]) {
    if (initialEvents && initialEvents.length > 0) {
      this.events = [...initialEvents];
    }
  }

  getEvents(): LedgerEvent[] {
    return [...this.events];
  }

  getLatestHash(): string {
    if (this.events.length === 0) {
      return 'GENESIS';
    }
    return this.events[this.events.length - 1].event_hash;
  }

  getNextSequence(): number {
    return this.events.length;
  }

  getNextMeta(): { prev_hash: string; sequence: number } {
    return { prev_hash: this.getLatestHash(), sequence: this.getNextSequence() };
  }

  append(draft: LedgerEventDraft): LedgerEvent {
    const prev_hash = this.getLatestHash();
    const sequence = this.getNextSequence();
    const id =
      draft.id ??
      hashObject({
        prev_hash,
        sequence,
        type: draft.type,
        actor_id: draft.actor_id,
        blueprint_id: draft.blueprint_id ?? null,
      });
    const timestamp = draft.timestamp ?? new Date().toISOString();

    const eventBase: LedgerEvent = {
      ...draft,
      id,
      timestamp,
      prev_hash,
      event_hash: '',
    };

    const event_hash = hashObject(stripEventHash(eventBase));
    const event: LedgerEvent = { ...eventBase, event_hash };

    this.events.push(event);
    return event;
  }

  verifyIntegrity(): LedgerIntegrityReport {
    const errors: string[] = [];
    for (let i = 0; i < this.events.length; i += 1) {
      const event = this.events[i];
      const expectedPrev = i === 0 ? 'GENESIS' : this.events[i - 1].event_hash;
      if (event.prev_hash !== expectedPrev) {
        errors.push(`event ${event.id} has invalid prev_hash`);
      }

      const expectedHash = hashObject(stripEventHash(event));
      if (event.event_hash !== expectedHash) {
        errors.push(`event ${event.id} has invalid event_hash`);
      }
    }

    return { ok: errors.length === 0, errors };
  }
}
