# Security Protocols

This document describes the security posture for LobsterFoundry Runner/Ledger and the controls implemented in this repository. It focuses on integrity, non-repudiation, and safe economic execution.

## Threat Model (Baseline)

- Tampering with proposals or ledger history
- Replay of signed requests
- Unauthorized execution of high-impact actions
- Economic abuse (mint cap bypass, escrow drain, verifier collusion)
- Unbounded payouts (treasury drain)

## Core Controls

### 1) Signed Blueprints (Ed25519)

- Blueprints can include `auth` metadata with `signer_id`, `signature`, `nonce`, and algorithm.
- Canonical signing uses a stable JSON encoding of the envelope with the signature field removed.
- `SecurityEngine` verifies the signature using the signer registry or the envelope-provided public key.

### 2) Anti-Replay Nonces

- Each signer may register a nonce once.
- Nonces are persisted in Runner state to prevent replay across restarts.

### 3) Least-Privilege License Guards

- Security policy can map blueprint kinds to minimum licenses (school + tier).
- Verification and moderation actions can be gated behind their respective licenses.

### 4) Tamper-Evident Ledger

- All ledger events are hash-chained.
- Integrity verification replays the chain to detect tampering.

### 5) Escrow Isolation and Stake Locks

- Sponsorship funds are locked to escrow accounts.
- Verifier stakes are locked to stake accounts before stamps can be applied.
- Stakes can be released or slashed via sanction paths.

### 6) Audit Sampling + Budget Caps

- Sampling audits can be required by policy.
- Audit pay is debited from the treasury and enforced against weekly caps.

### 7) Sanctions and Appeals

- Sanctions support stake slashing and submission rejection.
- Appeals are recorded and transition sanctions to `UNDER_APPEAL`.

## Operational Recommendations

- Store signer public keys in an external registry or HSM-backed service.
- Rotate keys and revoke compromised signers.
- Log all blueprint submissions and keep immutable offsite backups.
- Apply rate limits at the API layer for proposal submission.
- Perform regular ledger integrity checks and snapshot verification.

## Known Gaps (Planned)

- Revocation lists for signer IDs
- Multi-sig for high-impact blueprints
- Formal audit guild workflows and quorum rules
- API-level auth and session security (outside Runner scope)
