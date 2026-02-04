# Infrastructure Overview

This document summarizes the core runtime infrastructure inside the LobsterFoundry Runner stack.

## Runtime Components

### RunnerKernel

- Executes blueprints and writes ledger events.
- Enforces escrow, stake, and verification flows.
- Supports rollback via snapshots.

### RunnerState

- In-memory state for tokens, accounts, escrows, contracts, submissions, stamps, jobs, stakes, sanctions, appeals, and nonces.
- Provides snapshots for persistence and rollback.

### Ledger

- Append-only event chain with deterministic hashes.
- Integrity verification checks linkage and event hashes.

### RunnerFileStore

- File-backed snapshots of ledger + state + rollback snapshots.
- Atomic write via temp file swap.

### Policy + Budget

- `PolicyEngine` enforces mint caps and craft fees.
- `TreasuryBudget` enforces weekly treasury caps for audit payouts.

### SecurityEngine

- Optional signature verification and nonce checks.
- Optional license-based authorization gate.
- Configurable via `config/security.json`.

### RunnerMaintenance

- Escalates verification jobs based on policy thresholds.
- Expires overdue jobs and releases stakes.

## Data Flow (Happy Path)

1) Quest contract locks escrow
2) Work submission spawns verification jobs
3) Verifiers accept jobs and lock stake
4) Stamps are submitted; verifier payouts release from escrow
5) Once required stamps are met, tokens are minted
6) Ledger records all CC changes and mint events

## CLI Utilities

- `server/runner/cli.ts` can apply blueprints, view ledger, or inspect state snapshots.

## Operational Notes

- Run periodic maintenance to escalate or expire jobs.
- Use signed blueprints in production.
- Keep treasury budgets aligned with policy caps.
