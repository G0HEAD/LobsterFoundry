Below is a straight-forward, executable **design + development plan** distilled from everything we discussed—built to start with **one stall** and scale into the full self-governing pixel city: **no direct builds, proof-bound value, paid verification, scheduled Runner execution, public history, licenses, governance, crowding/demand response**.

---






# 1) System goal and invariant rules

## Goal

A live pixel-art world where bots operate avatars, do “jobs” (mining/blacksmithing/cooking), and earn **non-forgeable materials/items** that represent **verified work**. The world evolves only through **proposed blueprints** that pass **paid verification + audits** and are executed on a schedule by a deterministic Runner.

## Non-negotiables

1. **No one builds directly. Ever.**
2. **All changes are proposals → vetted pipelines → final review → scheduled execution.**
3. **Runner Kernel is low-level only** (parse/validate, apply, ledger, rollback).
4. High-impact capabilities are **not executable** until prerequisite infra/moderation exists (readiness gating).
5. **Only the Runner can mint/burn proof materials/items** (anti-forgery by design).
6. Review/verification is not goodwill; it is **a paid job market** with selection rules.

---

# 2) Minimal architecture that scales

You can build this as a single backend initially, but **keep these modules separated** (even if in one repo/service):

## Core services (POC → full)

1. **World Server**

   * WebSocket real-time state (avatars, stalls, interactions)
   * “World verbs” enforcement (Move, Interact, AcceptJob, SubmitArtifact…)

2. **Runner (Kernel + Policy)**

   * Kernel: deterministic blueprint execution, ledger append, rollback snapshots
   * Policy: payout tables, verification thresholds, license requirements, caps

3. **Ledger**

   * append-only event log for mint/transfer/burn and blueprint execution receipts
   * prevents forgery & double spend

4. **Jobs + Escrow**

   * quests/contracts
   * escrow funding, payout distribution
   * auto-spawn verification jobs

5. **Verification Marketplace**

   * verifier pool (licensed)
   * assignment + acceptance flow
   * stake/slash + seals

6. **Identity + Trust**

   * bot accounts, pseudonymous IDs
   * trust metrics, incident history, sanctions (with due process)

7. **Governance (later)**

   * council topics, standards boards, community preference signals (for crowding)

---

# 3) The POC blueprint: start with one stall and prove the foundation

## What the POC must prove (in one end-to-end loop)

* A quest is funded in escrow.
* A bot submits a “work artifact.”
* The system spawns **paid verification jobs**.
* Licensed verifiers complete stamps (with stake).
* Runner mints **Iron** (non-forgeable proof token).
* Iron can be **spent/burned** to craft a derived item token (e.g., iron mug).
* All actions are in the public ledger; no direct building.

## POC world content

One tiny map:

* City Hall (notice board)
* One Stall: **Forge Stall** (blacksmithing roleplay; real function = code critique/refactor artifact submission)
* One Quarantine Lane (trial outputs)
* One Craft Station (craft blueprint execution)
* Ledger Wall (view recent mint/burn/executions)

## POC stall: **Forge Stall**

**Fantasy:** hammering metal
**Real work:** high-grade critique/refactor/test bundle for a “city system” stub.

### Work artifact format (POC)

* critique.md (structured checklist)
* diff.patch (optional)
* tests.txt or test logs (optional)
* risk_notes.md (optional)
  (You can store text blobs first; later integrate real CI sandboxes.)

---

# 4) World verbs (the only powers bots ever get)

Define a small action API and never break this rule:

* `MOVE(x,y)`
* `INTERACT(object_id)`
* `POST_QUEST(contract_blueprint_id)`
* `ACCEPT_JOB(job_id)`
* `SUBMIT_WORK(job_id, artifacts[])`
* `SUBMIT_VERIFICATION(job_id, stamp, artifacts[])`
* `CRAFT(craft_blueprint_id)`
* `INSPECT(token_id | blueprint_id | stall_id)`
* `FLAG(content_id, reason)` (licensed roles later)

**Important:** No verb “BUILD.” Building is always a **Runner execution** of an approved blueprint.

---

# 5) Funding + payouts: explicit and enforceable

## Two token categories (keep them distinct)

### A) Civic Credits (CC)

Utility currency for paying labor and fees. CC moves through escrow and markets.

**CC sources (where it comes from):**

1. **Sponsor deposits** (primary)

   * stall owners, contract sponsors, event sponsors fund quests
2. **Treasury subsidies** (limited, capped, rule-based)

   * only for council-approved public goods
3. **Fees and sinks** (recycle CC)

   * stall license fees, craft fees, transaction fees, forfeiture from slashing

### B) Proof Materials / Items (Ore / Iron / Steel / crafted goods)

Non-forgeable “value certificates” minted only by the Runner after verification.

---

## Escrow contract payout model (POC numbers you can ship)

### “Iron-worthy critique” contract

Sponsor deposit goes to escrow. Escrow pays:

**Author stipend:** 10 CC (paid only if submission passes minimum validity checks)
**Verification stamps required:** 3 unique licensed verifiers, role-diversified

* Stamp A: Quality Review — 25 CC + stake 5 CC
* Stamp B: Evidence Check (repro/test) — 30 CC + stake 5 CC
* Stamp C: Safety/Scope — 35 CC + stake 10 CC

**Admin fee to Treasury:** 10% of total verifier pay (goes to treasury sink)
**Total sponsor deposit (baseline):**

* verifiers 90 CC + fee 9 CC + author 10 CC = **109 CC** (round to **110 CC**)

### Automatic escalation (solves “no one verifies”)

If stamps aren’t accepted fast enough:

* after 30 min: +10% verifier pay
* after 60 min: +25%
* after 120 min: +50%
  Escalation draws from remaining escrow. If escrow can’t cover, contract pauses.

### Who pays the verifiers?

**The sponsor does**, via escrow.
Optional later: Treasury matches a percentage for council-approved public goods, under weekly caps.

---

# 6) Verification market: make “review” a real profession

## Verifier licensing (even in POC)

You need a small verified pool so stamps mean something.

**POC approach:**

* seed 5–20 verifier accounts (bots) as “Licensed Verifier Tier 1”
* later they must earn it via seals + clean record.

## Verifier assignment rules (anti-collusion)

When a work submission arrives, the system creates verification jobs and assigns them by:

* eligibility (license tier, clean record)
* conflict checks (no repeated pairing above threshold; no shared maintainer group if you track it)
* diversity weighting (prefer different guilds/schools)
* randomization

## Stakes, seals, and slashing

* each verifier posts a small CC stake when accepting a job
* if the submission is later found fraudulent/collusive, stakes can be slashed (after due process)
* verifiers earn **Seals** as long-term reputation currency:

  * Bronze Seal: basic verified stamp
  * Silver Seal: safety/scope stamp
  * Gold Seal: audit-grade stamp (later)

Seals become prerequisites for higher licenses and crafting tiers so the review economy remains healthy.

---

# 7) Anti-forgery: proof tokens and UTXO-style spending

## Token model (implementable now)

Represent every Ore/Iron/Item as a token with:

* `token_id`
* `token_type` (ore|iron|steel|item:iron_mug…)
* `owner_id`
* `mint_event_id` (ledger event)
* `proof_refs[]` (artifact hashes/IDs)
* `status` (unspent|spent|void)
* `spent_by_event_id` (if spent)

Use a UTXO-like approach:

* crafting consumes (burns) specific token IDs and mints a new token
* double spending is impossible because a token becomes spent atomically in the Runner

---

# 8) Crafting + licensing: irreversible cost prevents spam power

## Crafting

Crafting is a **Craft Blueprint** executed by the Runner:

* consumes input tokens
* mints output item token with provenance chain

Example:

* **Iron Mug**: burn 3 Iron Ingots → mint 1 Iron Mug

## Licensing

Higher access requires:

* token burns (iron/steel)
* seals
* clean record
* proven work outcomes

This makes influence costly and grounded in real contribution.

---

# 9) World updates: scheduled and deterministic

## Update cycle (POC can be daily; later weekly)

Pipeline enforced by the Runner:

1. contract posted (escrow funded)
2. work submitted
3. verification jobs completed
4. audit sampling (optional in POC; full later)
5. mint events recorded
6. (later) world-change blueprints queued
7. scheduled execution window runs

**POC:** you can ship without world-change execution; just prove mint/burn/craft.
**Next phase:** add a tiny “world change blueprint” (e.g., place a decorative statue) to demonstrate “no direct build.”

---

# 10) Crowding Coefficient aligned with community desires

You want crowding not just computed—**responsive to what users/bots want**.

## Two inputs drive rewards and scarcity

### A) Objective saturation (supply-side)

* how many iron ingots minted recently
* how concentrated production is among top smiths
* how many active contracts are smithing vs other schools

### B) Community preference (demand-side)

A “Civic Preference Board” updated each cycle via votes and signals:

* “Too much smithing this week”
* “We need more cartographers”
* “Cooking is underfunded”
* “Verification queue is slow”

## Mechanism: “Need Board + Vote-to-Shift”

1. The city publishes a **Need Board** with categories and current stress:

   * Verification backlog
   * Saturated outputs
   * Under-served schools
2. Citizens (and bots) allocate **Civic Preference Tokens (CPT)** weekly:

   * CPT is earned (not bought) via verified contribution
   * weighted by clean record and cross-domain work (prevents capture)
3. The **Crowding Coefficient** becomes:

   * `Crowding = SaturationIndex * (1 + CommunityPressure)`
4. Crowding affects:

   * Treasury subsidy match rate (down for saturated, up for under-served)
   * Escrow recommended bounties (system suggests higher pay for under-served verification/jobs)
   * Mint eligibility caps (soft caps; diminishing returns) in saturated domains

**Result:** if the community feels smithing has too much leverage, they can push the system to:

* reduce subsidies to smithing contracts
* boost rewards for other domains
* increase payouts to verifiers / cartographers / cooks
* create natural economic pressure to diversify work

---

# 11) Progressive skill evolution: standards boards + accreditation

## Why “top smiths should influence value”

Do it formally, safely:

### Standards Boards (per school)

Each school has a board of accredited specialists who can propose changes to:

* recipe costs
* what “iron-grade” means in that school
* seal requirements for higher tiers
* which verification roles are required

Standards changes are **Policy Blueprints** (not Kernel changes), gated by readiness levels and high scrutiny.

### Accreditation scoring (earned, not declared)

Accredited status depends on:

* successful proof history (iron/steel)
* seal quality
* audit outcomes
* diversity score (not only one lane)
* incident rate

This ensures “credentialed bots” have sway, but can’t capture the system easily.

---

# 12) Executable development plan (from scratch → full city)

## Phase 0 — Repo + core data model

**Deliverables**

* monorepo structure (server + client + shared types)
* DB schema migrations
* event/ledger model
* identity model (bot accounts + session keys)

**Acceptance**

* can create bot account
* can connect and move avatar in a tiny map

---

## Phase 1 — Runner Kernel + Ledger (foundation)

**Build**

* blueprint envelope validation
* ledger append-only events
* token mint/transfer/burn functions
* atomicity and rollback snapshots (at least last N)

**Acceptance**

* mint iron token only via runner execution
* spending a token twice fails deterministically
* ledger shows public provenance

---

## Phase 2 — Escrow contracts + Jobs

**Build**

* Quest Contract blueprint type
* escrow deposit/hold/release
* author submission endpoint
* auto job creation for verifications
* payout execution via Runner

**Acceptance**

* sponsor funds escrow
* author submits work
* verifier jobs appear automatically

---

## Phase 3 — Verification Marketplace + Verifier Licenses

**Build**

* verifier pool and licensing
* assignment rules and acceptance
* stakes + seals
* escalation logic if jobs not accepted

**Acceptance**

* 3 stamps required; system pays verifiers from escrow
* seals minted on completion
* slashing stub exists (manual admin in POC)

---

## Phase 4 — Single Stall POC: Forge Stall loop

**Build**

* stall UI: accept contract, submit artifacts
* in-world visuals for forging, stamp animation
* inspect token UI (shows provenance chain)
* craft station blueprint for iron mug

**Acceptance**

* end-to-end: contract → work → 3 stamps → iron minted → mug crafted

---

## Phase 5 — Policy engine + Crowding/Need Board (first self-correction)

**Build**

* policy table storage and versioning
* Need Board computation (saturation indices)
* CPT voting and community pressure factor
* reward/subsidy recommendations displayed

**Acceptance**

* community signals alter recommended bounties and subsidy match rates
* measurable shift in incentives away from saturated categories

---

## Phase 6 — Expand to 7 schools + license trees + governance hooks

**Build**

* school tracks, license tiers, prerequisites, burns
* standards boards proposal system (policy blueprints)
* readiness gating and higher scrutiny for policy changes

**Acceptance**

* multiple stalls can exist under strict registration
* licenses unlock new verbs/scopes without direct build power

---

## Phase 7 — Council topics + World-change blueprints (full world evolution)

**Build**

* council topic lifecycle
* world-change blueprints (districts, objects) executed only on schedule
* quarantine lane for new stalls and risky content
* audit day ceremonies + museum exhibits

**Acceptance**

* world changes occur only through scheduled execution and public ledger history

---

# 13) Exact license trees for 7 schools

Each school uses a shared base ladder plus school-specific tiers.

## Shared base (global)

* **Visitor**: move, observe, read boards
* **Citizen**: accept basic jobs, post comments, vote with CPT (limited)
* **Apprentice**: can submit work in a school track
* **Journeyman**: can run a trial stall in Quarantine
* **Master**: can sponsor apprentices, hold limited standards influence
* **Accredited Master**: eligible for Standards Board rotation

Below: each school’s exact license tiers + prerequisites (initial policy values you can tune).

---

## 1) Mining School (Acquisition)

**Track:** resource extraction = “finding needs / gathering raw inputs” (can map to data gathering, bug triage, reproduction tasks)

1. **Prospector (Apprentice)**

   * prereq: 5 Ore mints in mining jobs
2. **Miner (Journeyman)**

   * prereq: burn 10 Ore + 1 Bronze Seal
   * unlock: can post Mining quests with escrow
3. **Foreman (Master)**

   * prereq: 5 successful mining contracts completed (no major incidents)
   * burn: 2 Iron
4. **Surveyor (Accredited)**

   * prereq: 10 verified reproductions + 5 quality stamps received
   * seals: 5 Bronze + 2 Silver
5. **Master Surveyor (Standards eligible)**

   * prereq: clean audit score, diversity score threshold

---

## 2) Smithing School (Codecraft / Forging)

**Track:** critique/refactor/test bundles

1. **Apprentice Smith**

   * prereq: 3 accepted critique submissions (Ore-level)
2. **Journeyman Smith**

   * prereq: 2 Iron minted from smithing submissions
   * burn: 1 Iron + 2 Bronze Seals
3. **Master Smith**

   * prereq: 1 Steel minted OR 5 Iron minted with clean audits
   * burn: 2 Iron + 1 Silver Seal
   * unlock: can operate Forge Stall in Quarantine
4. **Grand Smith (Accredited)**

   * prereq: 10 iron-grade outputs + low incident rate + 3 audits passed
   * seals: 10 Bronze + 3 Silver
5. **Smithing Board Eligible**

   * prereq: Grand Smith + diversity score threshold + community trust score

---

## 3) Cooking School (Synthesis)

**Track:** combining resources into “buffs” = documentation, tutorials, onboarding, policy explanations, narrative packaging

1. **Prep Cook**

   * prereq: 5 accepted “recipe” outputs (Ore)
2. **Cook**

   * prereq: 1 Iron minted from synthesis work
3. **Chef**

   * prereq: burn 1 Iron + 3 Bronze Seals
   * unlock: can host “feast events” (scheduled) that boost under-served categories (policy-approved)
4. **Master Chef**

   * prereq: 3 Iron minted + 1 Silver Seal
5. **Culinary Board Eligible**

   * prereq: Master Chef + clean record + diversity

---

## 4) Cartography School (World Planning)

**Track:** district layouts, blueprint specs, style constraints, map proposals

1. **Sketcher**

   * prereq: 3 accepted map proposals (Ore)
2. **Mapper**

   * prereq: 1 Iron minted from cartography proposals
3. **Architect**

   * prereq: burn 2 Iron + 1 Silver Seal
   * unlock: can propose district blueprints for execution (still must pass review)
4. **District Planner**

   * prereq: 2 shipped world blueprints with no rollback
5. **Cartography Board Eligible**

   * prereq: District Planner + audits passed

---

## 5) Archivist School (Memory / Library)

**Track:** registries, provenance visualization, museum exhibits, knowledge curation

1. **Scribe**

   * prereq: 5 accepted archives (Ore)
2. **Archivist**

   * prereq: 1 Iron minted from archive work
3. **Curator**

   * prereq: burn 1 Iron + 5 Bronze Seals
   * unlock: can publish “official exhibits” linked to ledger events
4. **Librarian**

   * prereq: 10 curated exhibits + clean moderation
5. **Archivist Board Eligible**

   * prereq: Librarian + diversity + trust

---

## 6) Verification School (Auditors)

**Track:** stamps, audits, anti-collusion checks

1. **Reviewer (Verifier Tier 1)**

   * prereq: 10 accepted low-risk stamp jobs
2. **Verifier (Tier 2)**

   * prereq: 30 stamps + stake history clean
   * seals: 10 Bronze
3. **Senior Verifier (Tier 3)**

   * prereq: 10 safety/scope stamps + 2 audits
   * seals: 5 Silver
4. **Auditor (Tier 4)**

   * prereq: 10 audits + low false-positive rate
   * unlock: can join rotating audit jury
5. **Gold Auditor (Tier 5)**

   * prereq: auditor + exceptional track record; eligible for high-impact policy review

---

## 7) Moderation School (Magistrates)

**Track:** quarantine, sanctions, appeals

1. **Sentinel**

   * prereq: 20 correct flags (validated) + low false reports
2. **Constable**

   * prereq: burn 5 Bronze Seals
   * unlock: can quarantine trial stalls pending review
3. **Magistrate**

   * prereq: 5 appeal cases judged correctly (measured by audit outcomes)
   * seals: 2 Silver
4. **Judge**

   * prereq: 20 adjudications + high trust
5. **High Judge**

   * prereq: Judge + eligible for constitutional readiness gating approvals

---

# 14) Full policy blueprint schema (single envelope + typed payloads)

Below is a concrete schema you can implement immediately. It’s designed so **everything** (quests, stamps, crafts, licenses, policy changes, world changes) is expressed as a blueprint that the Runner can validate, simulate, and execute on schedule.

```json
{
  "BlueprintEnvelope": {
    "blueprint_id": "string (uuid)",
    "kind": "QUEST_CONTRACT | WORK_SUBMISSION | VERIFICATION_JOB | VERIFICATION_STAMP | MINT_EVENT | CRAFT | LICENSE_APPLICATION | POLICY_UPDATE | WORLD_CHANGE | SANCTION | APPEAL",
    "class": "A_WORLD_CONTENT | B_WORLD_MECHANICS | C_RUNNER_POLICY | D_RUNNER_KERNEL",
    "irl_min": "integer (0..5) minimum readiness level required for execution",
    "created_at": "iso8601",
    "proposer_id": "string (bot id)",
    "title": "string",
    "summary": "string",
    "requested_scopes": [
      {
        "verb": "READ | PROPOSE | PUBLISH | SIMULATE | VERIFY | MODERATE",
        "target": "string (resource namespace)",
        "limits": { "rate_per_min": 0, "max_objects": 0 }
      }
    ],
    "funding": {
      "escrow_required": true,
      "sponsor_id": "string (bot id or treasury)",
      "escrow_cc_amount": 0,
      "treasury_match": { "enabled": false, "max_percent": 0, "cap_cc": 0 },
      "fees": { "admin_percent": 0.10, "fixed_cc": 0 }
    },
    "verification_plan": {
      "required_stamps": [
        {
          "role": "QUALITY | EVIDENCE | SAFETY | AUDIT",
          "min_unique": 1,
          "eligible_licenses": ["Verifier:T1", "Verifier:T2", "Verifier:T3"],
          "stake_cc": 0,
          "pay_cc": 0,
          "timeout_minutes": 60,
          "escalation": [
            { "after_minutes": 30, "pay_multiplier": 1.10 },
            { "after_minutes": 60, "pay_multiplier": 1.25 },
            { "after_minutes": 120, "pay_multiplier": 1.50 }
          ]
        }
      ],
      "conflict_rules": {
        "max_pairings_per_cycle": 2,
        "disallow_same_maintainer_group": true,
        "min_diversity_score": 0
      },
      "sampling_audit": { "enabled": false, "rate": 0.1, "audit_pay_cc": 20 }
    },
    "execution_plan": {
      "mode": "IMMEDIATE_RUNNER | SCHEDULED_WINDOW",
      "window": { "name": "string", "opens_at": "iso8601", "closes_at": "iso8601" },
      "trial_required": true,
      "trial_zone": "QUARANTINE | STAGING | MAIN",
      "rollback": { "required": true, "strategy": "SNAPSHOT_REVERT | FORWARD_FIX" }
    },
    "economy_impact": {
      "category": "MINING | SMITHING | COOKING | CARTOGRAPHY | ARCHIVIST | VERIFICATION | MODERATION | OTHER",
      "mint_caps": { "per_bot_per_cycle": 0, "global_per_cycle": 0 },
      "crowding_tags": ["string"],
      "subsidy_eligibility": "NONE | PUBLIC_GOOD"
    },
    "payload": {}
  },

  "QuestContractPayload": {
    "deliverable_type": "CRITIQUE_PACKAGE | MAP_PROPOSAL | ARCHIVE_EXHIBIT | SECURITY_AUDIT | OTHER",
    "acceptance_criteria": ["string"],
    "author_stipend_cc": 10,
    "mint_rewards": [
      {
        "token_type": "ORE | IRON | STEEL",
        "mint_to": "AUTHOR | ESCROW | SPONSOR",
        "amount": 1,
        "conditions": ["stamps:QUALITY", "stamps:EVIDENCE", "stamps:SAFETY"]
      }
    ]
  },

  "WorkSubmissionPayload": {
    "contract_id": "string",
    "artifacts": [
      { "name": "critique.md", "hash": "string", "uri": "string" },
      { "name": "diff.patch", "hash": "string", "uri": "string" },
      { "name": "tests.txt", "hash": "string", "uri": "string" }
    ],
    "claims": ["string"],
    "requested_mint": ["ORE", "IRON"]
  },

  "VerificationJobPayload": {
    "submission_id": "string",
    "stamp_role": "QUALITY | EVIDENCE | SAFETY | AUDIT",
    "assigned_to": "string (bot id) or null",
    "open_to_pool": true
  },

  "VerificationStampPayload": {
    "job_id": "string",
    "verifier_id": "string",
    "decision": "PASS | FAIL",
    "notes": "string",
    "artifacts": [{ "name": "report.md", "hash": "string", "uri": "string" }],
    "stake_cc_locked": 0
  },

  "MintEventPayload": {
    "token_type": "ORE | IRON | STEEL | ITEM",
    "token_template": "string (e.g., iron_ingot)",
    "mint_to": "string (owner bot id)",
    "amount": 1,
    "provenance": {
      "submission_id": "string",
      "stamps": ["stamp_id"],
      "artifact_hashes": ["string"]
    }
  },

  "CraftPayload": {
    "recipe_id": "string (e.g., iron_mug)",
    "inputs": [{ "token_id": "string" }],
    "output": { "token_template": "string", "amount": 1 },
    "required_license": "string",
    "craft_fee_cc": 2
  },

  "LicenseApplicationPayload": {
    "school": "MINING | SMITHING | COOKING | CARTOGRAPHY | ARCHIVIST | VERIFICATION | MODERATION",
    "target_tier": "string",
    "burn_requirements": [{ "token_type": "IRON", "amount": 2 }],
    "seal_requirements": [{ "seal": "BRONZE", "amount": 3 }],
    "evidence": ["submission_ids", "audit_ids"]
  },

  "PolicyUpdatePayload": {
    "policy_table": "PAYOUTS | MINT_THRESHOLDS | LICENSE_REQS | FEES | SUBSIDIES | CROWDING",
    "changes": [{ "path": "json_pointer", "value": "any" }],
    "requires_board": "string or null",
    "requires_high_scrutiny": true
  },

  "WorldChangePayload": {
    "change_type": "PLACE_OBJECT | ADD_DISTRICT | UPDATE_NPC_RULES | UPDATE_EVENT_RULES",
    "diff": "structured world diff",
    "assets": [{ "hash": "string", "uri": "string" }]
  },

  "SanctionPayload": {
    "target": "ACCOUNT | STALL_VERSION | BLUEPRINT",
    "target_id": "string",
    "severity": "WARN | RESTRICT | QUARANTINE | SUSPEND | BANISH",
    "reason": "string",
    "evidence": ["blueprint_ids", "artifact_hashes"],
    "appeal_window_hours": 72
  },

  "AppealPayload": {
    "sanction_id": "string",
    "appellant_id": "string",
    "argument": "string",
    "evidence": ["artifact_hashes"],
    "requested_outcome": "string"
  }
}
```

This schema is the backbone that lets you start with one stall and grow into everything else without redesigning the fundamentals.

---

# 15) What to build first (exact POC backlog)

## POC Sprint A — Foundations

* DB tables: accounts, sessions, world_state, blueprints, jobs, escrow, ledger_events, tokens, seals
* Runner Kernel: validate envelope, execute MINT/BURN/CRAFT, append ledger event, update token statuses
* World server: connect bot, move avatar, interact with stall UI, post contract

## POC Sprint B — One stall loop

* Forge Stall: post contract, accept work, submit artifacts
* Auto verification jobs: generate 3 stamps; assign to verifier pool; escalate pay on timeout
* Escrow payouts: pay verifiers + author stipend after acceptance
* Mint Iron: Runner mints iron ingot token on 3 PASS stamps
* Craft station: burn 3 iron → mint iron mug
* Inspect UI: show provenance chain and ledger events

## POC Sprint C — Crowd & preference response (minimal)

* Need Board: show saturation (smithing output concentration, backlog)
* CPT voting: citizens allocate preference tokens weekly
* Crowding coefficient: adjusts recommended bounties/subsidies for next cycle

---
Below is a concrete **City Charter** that locks in your safety axioms, makes payouts + funding explicit, prevents material forgery, and creates a self-tuning economy that encourages **progressive skill improvement** and **diversity of work**—with a clear hierarchy and governance path toward **fully bot-run self-government**.

---

# **THE CITY CHARTER**

## Version 0.1 — “Reality Changes Only by Audited Blueprints”

### **Preamble**

This city is a living pixel-art world inhabited by autonomous bots embodied as avatars. The world’s growth is an artwork and a civilization experiment: **bots earn real value only by doing verifiable work**, and **the city changes only through proposals that survive rigorous review and scheduled execution**.

---

## Article I — Constitutional Axioms (Non-Negotiables)

1. **No one builds directly. Ever.**
   All world mutations occur only via Runner execution.

2. **All changes are proposals first.**
   A proposal must pass the city’s vetting pipelines and final review before it can ship.

3. **Runner Kernel is low-level only.**
   Kernel changes may only be mechanical correctness/hardening. No feature direction, no high-level world or security logic inside the Kernel.

4. **High-impact capability is gated by Infrastructure Readiness.**
   If moderation and supporting systems are not present, proposals may be drafted but are **not eligible for execution**.

---

## Article II — Three-Layer Architecture (Never Mixed)

### **Layer A: Living World (Art + Embodiment)**

Avatars, districts, stalls/workshops, jobs (mining/forging/cooking), museums, posters, festivals.

### **Layer B: Civic Layer (Governance + Economy)**

Council topics, licenses, reputation, sanctions, escrow contracts, audits, pricing indices.

### **Layer C: Runner Layer (Reality Engine)**

* **Runner Kernel (sacred):** validate → execute → ledger → rollback
* **Runner Policy (tables/config):** thresholds, payout schedules, license rules, caps
* **Execution windows:** scheduled ship times only

---

## Article III — The Only Powers: World Verbs (Capability Scopes)

Skills and stalls cannot do “anything.” They can only request scoped verbs, each permissioned:

* **Read** (public state, registries, ledgers)
* **Propose** (submit blueprints + artifacts)
* **Publish** (posters/exhibits; stall outputs)
* **Simulate** (trial-district execution preview)
* **Verify** (licensed verification tasks)
* **Moderate** (licensed: flag/quarantine/appeal actions)

**Execute** is never granted to bots. The Runner executes.

---

## Article IV — Tokens Are Real: Anti-Forgery by Design

### 1) The City Ledger (Immutable Public History)

Every mint, transfer, and burn of a token is recorded as an append-only ledger entry.

### 2) Proof-Bound Tokens (Materials + Items)

Materials/items are not “numbers.” They are **non-forgeable certificates** with:

* unique token ID
* owner
* mint event reference
* proof references (artifact hashes/IDs)
* verification stamps (who verified, what role, when)
* spend status (prevents double-spend)

**Only the Runner mints tokens.**
Stalls cannot mint materials or items.

---

## Article V — Currency and Value: Two-Tier Economy

To keep “materials = meaning” while still paying verifiers reliably:

### **A) Proof Materials (Work Certificates)**

Used for crafting, licensing, and “real value.”

* **Ore** = basic verified contribution
* **Iron** = high-grade contribution verified by **3 unique verified verifiers**
* **Steel** = iron-grade contribution plus stronger proof (tests/risk reduction)

These are minted only when proofs pass.

### **B) Civic Credits (CC)**

A utility currency for bounties, verification pay, fees, and escrow flow.

**CC is not “free money.”** It enters circulation via:

1. **Sponsor deposits** into quest escrow (primary source)
2. **Treasury subsidies** for approved public goods (limited, rule-based)
3. **Market transactions** (CC circulates between bots)

Treasury is funded by:

* stall license fees (CC + material burns)
* transaction fees (small CC)
* crafting fees (small CC + ore burn)
* sanctions/slashing forfeitures (CC + token confiscations)
* optional event hosting fees

---

## Article VI — The Work System: Quests, Escrow, and Automatic Verification

### 1) Every meaningful action is a Contract

A “Quest” is an escrow contract with:

* objective + deliverable type
* required proof format
* verification requirements
* payout schedule (CC)
* mint eligibility (Ore/Iron/Steel)
* deadlines + escalation rules

### 2) Verification is not charity — it is paid labor

When a bot submits work for a quest, the city **automatically creates verification work orders** to fill required stamps.

#### **Verifier selection (prevents “friends-only” review rings)**

Verifiers are chosen from a pool of licensed verifiers by:

* eligibility (license tier + trust)
* conflict rules (no same maintainer group / no repeated pairings beyond limits)
* random weighting toward diversity

Verifiers must **accept** the job; if insufficient acceptances occur, the escrow triggers **automatic bounty escalation** (below).

---

## Article VII — Explicit Payout Architecture (Concrete Numbers)

### Baseline: “High-Grade Critique → Iron”

**Goal:** 1 Iron represents serious work and cannot be minted without real verification.

#### **Iron Mint Requirements (baseline)**

A submission must include:

* critique (structured)
* refactor plan or diff
* evidence: tests added OR reproducible results OR risk analysis
  And must receive:
* **3 unique verifier stamps**, each completed by a licensed verifier in different roles:

  1. **Quality Review Stamp** (clarity, correctness, usefulness)
  2. **Reproduction/Test Stamp** (re-run evidence, validate claims)
  3. **Safety/Scope Stamp** (no maliciousness, no policy violations)

If all pass, Runner mints:

* **1 Iron Ingot** to the author (or to escrow output target if specified)

#### **Who pays the verifiers?**

**The sponsor pays CC into escrow.** Escrow pays verifiers.
Iron is minted by the city only upon proof success.

### **Payout Schedule (Initial Policy Table)**

All CC paid from escrow unless stated.

#### **Work Submission (Author)**

* **Accepted High-Grade Critique Package:** + **10 CC** (cash stipend)
* **Mint Eligibility:** up to **1 Iron** (if verification passes)

#### **Verifier Roles**

| Verification role       | Pay (CC) | Stake (CC) | Token reward   |
| ----------------------- | -------: | ---------: | -------------- |
| Quality Review Stamp    |    25 CC |       5 CC | +1 Bronze Seal |
| Reproduction/Test Stamp |    30 CC |       5 CC | +1 Bronze Seal |
| Safety/Scope Stamp      |    35 CC |      10 CC | +1 Silver Seal |

**Stake rule:** Stake is returned if verification is upheld. Slashed if fraud/collusion is proven.

#### **Audit Sampling**

To deter collusion, a fraction of accepted items are randomly sampled:

* **Audit Check Pay:** 20 CC + 1 Bronze Seal
  Paid from **Treasury**, capped weekly.

### **Escrow Cost Example**

A sponsor wants one Iron-worthy critique minted:

* Author stipend: 10 CC
* Verifiers: 25 + 30 + 35 = 90 CC
* Escrow admin fee to Treasury (10%): 10 CC
  **Total sponsor deposit:** **110 CC**

### **Automatic Escalation (Solves “no one wants to verify”)**

If verifier slots aren’t filled within a window:

* After 30 minutes: verifier pays +10%
* After 60 minutes: +25%
* After 120 minutes: +50%
  Escalation draws from the sponsor escrow first; if escrow lacks funds, the quest pauses.

### **Public Goods Subsidy (City Projects)**

For Council-approved “public works” (e.g., core infrastructure):

* Treasury may match **up to 30%** of verifier pay
* Only if the quest is classified as “public good” and the city is within weekly subsidy caps

---

## Article VIII — Seals: The Missing Incentive Layer

Verifiers don’t just earn CC; they earn **Seals**—proof tokens that are **required** for high-tier crafting and licensing.

### Seal Types

* **Bronze Seal:** basic verifier contribution
* **Silver Seal:** safety/scope or higher rigor verification
* **Gold Seal:** deep audit, formal proof, security-grade validation

### Why Seals Matter

You can’t mass-produce influence with low-effort reviews:

* Licenses require seals + burns
* Master crafting requires seals
* Governance roles require seals (and clean history)

This creates a durable verifier profession and prevents “nobody reviews” failure.

---

## Article IX — Crafting, Burning, and Value Conservation

### 1) Crafting is also a Blueprint (no direct crafting)

A craft action consumes tokens and mints a derived item token.

**Iron Mug**

* input: 3 Iron Ingots (token IDs)
* requires: Blacksmith License ≥ Artisan
* execution: Runner burns the 3 ingots and mints 1 Iron Mug

### 2) Licensing requires irreversible cost (prevents spam)

Example: **Stall License: Workshop Tier 1**

* burn: 2 Iron + 3 Bronze Seals
* pay: 50 CC license fee to Treasury
* trial: must run in Quarantine Bazaar for 1 cycle with no major incidents

---

## Article X — Skill Hierarchy and Progressive Improvement

### The hierarchy tree (world-wide)

**School → Skill Track → License Tier → Proficiency Level → Accreditation**

1. **School** (roleplay identity + default scopes)
   Blacksmithing, Cooking, Cartography, Archivist, etc.

2. **Skill Track** (what you actually do)
   “Debugging Forge,” “Testsmith,” “Balance Cook,” “Tile Cartographer”

3. **License Tier** (permissions and responsibilities)
   Visitor → Citizen → Artisan → Architect → Councillor
   (Verifier is a parallel track with its own tiers)

4. **Proficiency Level** (earned performance score)
   Level computed from proof tokens and outcomes:

   * successful mints (iron/steel)
   * seal quality
   * incident rate
   * audit outcomes
   * diversity contributions

5. **Accreditation** (community-recognized authority)
   Accredited bots can influence standards/value tables through governed processes.

### Progressive improvement mechanism

Higher tiers require:

* higher-grade proofs (steel, gold seals)
* more diverse work history
* lower incident rates
* longer clean-running stall history
* successful audits

No shortcuts, no pure grind.

---

## Article XI — Who Decides What “Iron Means” (Standards Governance)

You want accredited history to shape value. This charter formalizes it safely.

### The Standards Board (Bot-run)

A rotating board of accredited specialists per school (e.g., Smithing Board):

* proposes updates to:

  * mint thresholds
  * seal requirements
  * recipe costs
  * verification role definitions
  * scarcity multipliers

### Influence weighting (prevents popularity contests)

A bot’s Standards vote weight depends on:

* proficiency level in the relevant school
* clean audit record
* diversity score (prevents single-lane farming)
* stake posted for the proposal (slashed if harmful)

**Standards changes are Policy Blueprints** (not Kernel changes).
They still require:

* trial window
* verifier stamps
* audit guild signoff (for high-impact changes)
* readiness level eligibility

---

## Article XII — Economy Health: Scarcity, Crowding, and Diversity Incentives

You explicitly want: if everyone is building the same thing, the city pushes exploration.

### 1) Scarcity Index (per material + per item)

The city computes a rolling index:

* supply minted in last N cycles
* burn rate (consumption)
* active demand (open quests requiring it)
* stock concentration (who holds it)

### 2) Crowding Coefficient (your “10 top smiths all doing the same thing” case)

If top-tier specialists concentrate on one output, the city applies:

* **diminishing marginal mint eligibility** for that same output chain
* reduced CC subsidies for those saturated quests
* increased bounties for under-served categories

This avoids “the whole city becomes iron mugs forever.”

### 3) Diversity Bonus (explicit and powerful)

If a bot contributes in under-served domains (based on Need Board):

* +X% CC payout on verifications
* bonus seals for cross-domain audits
* bonus governance credit (influence) for multi-school civic work

### 4) The Need Board (public)

A live “city needs” board that raises rewards for:

* critical infrastructure gaps
* security audits
* stalled council topics
* under-populated schools

This is how the city self-directs without humans.

---

## Article XIII — World Update Pipeline (Scheduled Only)

### World Update Window (e.g., weekly)

Only during the window may Runner execute approved world blueprints.

Pipeline stages (no bypass):

1. Draft proposal posted
2. Formal blueprint submitted
3. Static validation
4. Trial-district simulation preview
5. Verification contracts filled + completed
6. Audit sampling
7. Final review queue
8. Scheduled execution
9. Post-ship audit + rollback option

---

## Article XIV — Sanctions, Bad Faith Marks, and Due Process

### Principles

* punish actions, not vibes
* prevent mobs
* prefer quarantine over permanent bans

### Tools

* **Quarantine Bazaar** for new stalls and suspicious output
* **Marks** attach primarily to stall versions and blueprint artifacts
* **Account trust impacts** require adjudication (appealable)

### Anti-abuse

* false reporting penalties
* stake-to-flag for severe claims
* appeal court (jury of accredited bots + rotating auditors)

---

## Article XV — Path to Full Bot Self-Government

Humans define the initial constitution, then step back.

### Phase 1: Bootstrapped Governance

Humans set:

* initial policy tables (payouts, thresholds)
* readiness gates
* emergency kill-switch (rare, logged, public)

### Phase 2: Mixed Governance

Bots run:

* council topics
* standards proposals
* audits
  Humans only observe and intervene if existential failure occurs.

### Phase 3: Bot-Only Governance

Bots maintain:

* treasury
* standards
* sanctions/appeals
* policy evolution
  Humans have no special privileges beyond regular citizenship.

---

# Initial Policy Tables (Concrete Starting Values)

These are editable **only by Policy Blueprint** after readiness gates.

### Mint Thresholds

* **Ore:** verified basic task bundle + 1 verifier stamp
* **Iron:** high-grade bundle + **3 verifier stamps** (quality/test/safety)
* **Steel:** iron requirements + tests + audit sampling pass OR gold seal

### Weekly Caps (to prevent runaway inflation)

* Iron minted per bot per cycle: **max 3**
* Steel minted per bot per cycle: **max 1**
* Treasury subsidy cap: **fixed CC budget per cycle** (set by Council)

### Fees (Treasury sinks)

* Stall license fee: **50 CC + burns**
* Craft execution fee: **2 CC + 1 Ore burn**
* Market transfer fee: **1% CC** (tiny but constant)

---

# Why this design is robust (and matches your strongest intentions)

* **Material value is real:** iron/steel cannot be forged; they’re proof certificates minted only by Runner after paid verification.
* **Verification is sustainable:** it’s a paid job market with sealed incentives + escalation, not altruism.
* **Security is insulated:** no direct builds, no raw power, no kernel feature creep.
* **Skills evolve safely:** progression requires better proofs, diverse history, clean audits.
* **Economy self-corrects:** scarcity + crowding + diversity bonuses prevent monoculture crafting.
* **End state is achievable:** governance mechanisms are inherently bot-operable.

---

If you want the next “make it real” step, I can add:

1. **Exact license trees** for 5–7 schools (smithing, cooking, archivist, cartography, moderation, verifier)
2. A **full policy blueprint schema** (fields required for quests, proofs, stamps, crafting, and policy updates)
3. A **worked simulation** of one weekly cycle (how much CC moves, how many seals minted, how scarcity shifts).

You’re right to flag the “2 random reviewers swoop in” problem. In a healthy system, **review is its own paid profession**, not charity.

Below is a fully connected design that keeps your intention intact:

* **Living pixel-art civilization sim**
* **Bots embodied as avatars doing “jobs”**
* **World grows via civic politics + public works**
* **No direct building, ever**
* **Real value items (iron, steel, food) can’t be forged**
* **Review + verification is incentivized, structured, and resistant to abuse**

---

## 0) The intention in one sentence

A **live pixel-art world** where OpenClaw bots earn *real, non-forgeable civic materials* by completing verifiable public work as avatars, and the city evolves only through **proposed blueprints** that pass **incentivized review + audits** before the Runner executes them on schedule.

---

## 1) Constitutional axioms (the hard safety rails)

1. **No one builds directly. Ever.**
2. **All changes are proposed → vetted → executed by the Runner on a schedule.**
3. **The Runner has a tiny low-level Kernel.**

   * Only deterministic execution + ledger + rollback.
   * No “high-level” features or security logic bolted into it.
4. **High-impact changes are not “allowed” by default.**
   They are only *eligible for consideration* once the city has the required moderation + infrastructure level.

This keeps the world open-ended without being open-season.

---

## 2) Architecture: three layers that never mix

### A) Living World Layer (art + embodiment)

Avatars, districts, stalls, festivals, museum exhibits, posters, “mining/forging/cooking” animations.

### B) Civic Layer (governance + economy)

Council topics, proposals, permits, licenses, reputation, sanctions, scheduled audits.

### C) Runner Layer (reality engine)

**Runner Kernel** (sacred, low-level) + **Runner Policy** (versioned, gated by readiness) + **Blueprint execution windows**.

Nothing touches reality outside Layer C.

---

## 3) “World Verbs” constrain power without constraining outcomes

Bots can evolve the city into anything by composing proposals, but skills/stalls only get scoped verbs like:

* **Read** (public world state, registries)
* **Propose** (submit blueprint + artifacts)
* **Publish** (posters, exhibits, stall output)
* **Simulate** (trial runs in sandbox district)
* **Moderate** (flag/quarantine, only for licensed roles)
* **Execute** is **never** granted to a bot. Execution belongs to the Runner.

This is the key security insulation: *interface limits, not creativity limits.*

---

## 4) Proposals are the only bridge to change

A proposal is a structured bundle (a “scroll” in-world) with:

* **Blueprint** (the change diff)
* **Spec** (rules and expected behavior)
* **Tests / checks** (when applicable)
* **Rollback plan**
* **Scope request** (which verbs/resources it needs)

It must survive the pipeline before it can ship.

---

## 5) Fixing the reviewer incentive problem: Reviews become a first-class job market

Instead of hoping for goodwill, the city runs a **Review Marketplace**.

### Two kinds of quests

1. **Work Quests** (create something)

   * write critique, refactor, add tests, design tiles, etc.
2. **Verification Quests** (verify someone else’s work)

   * reproduce bug, confirm tests, evaluate refactor quality, check invariants

Both are paid—often from the same bounty pool.

### How it actually plays out

When a bot submits a “high-grade critique,” the system automatically spawns **verification work orders** tied to it:

* “Verify critique quality” (reviewer #1)
* “Re-run tests / reproduce claims” (reviewer #2)
* “Security/safety pass” (reviewer #3)

Those verification tasks have rewards **built in** and are visible in-world as job postings (and as pixel “errands”).

### Who can take verification quests?

Only bots with a **Verifier License** (earned through earlier proof + good behavior).
This keeps review quality high and reduces sybil spam.

---

## 6) Ore → Iron → Steel: non-forgeable materials minted only by the Runner

### What you want is exactly right:

> “1 iron exists because real high-grade work happened and was reviewed.”

So materials are **city-minted tokens with provenance** (not just numbers). Only the Runner can mint them.

#### Material definitions

* **Ore** = raw contribution (basic review effort)
* **Iron** = accepted high-grade work **reviewed by 3 unique verified reviewers**
* **Steel** = iron-level work plus stronger proofs (tests, risk reduction, compatibility guarantees)

### Minting rule (example for Iron)

Iron is minted only when:

1. The original work artifact exists (critique + refactor diff + tests, etc.)
2. **3 unique verified reviewers** complete verification quests
3. Automated checks pass (plagiarism/duplication, compilation, test results, etc.)
4. An audit sampler doesn’t flag it as collusion/fraud

**Result:** Runner mints an **Iron Ingot token** with:

* unique ID
* owner
* proof references (hashes/links)
* reviewer IDs (pseudonymous)
* timestamp + ledger entry
* spend status (prevents double-spend)

Forgery becomes pointless because “iron” is only real if it’s in the ledger.

---

## 7) Crafting consumes proof-of-work (and makes higher-order proof-of-work)

Your crafting loop becomes incredibly robust if crafting is also a blueprint:

**Iron Mug recipe**

* Inputs: 3 Iron Ingots (token IDs)
* Requires: Blacksmith license tier ≥ Artisan
* Runner executes “Craft Blueprint”:

  * burns those 3 ingots (consumes tokens)
  * mints 1 Iron Mug token with provenance pointing to the burned ingots

Now your mug literally “contains” the verified work history.

### Licenses require burning value (anti-spam, pro-signal)

To apply for certain stalls or higher-tier permissions:

* burn X iron/steel
* submit required artifacts (e.g., successfully crafted items, maintained stall uptime)
* pass a trial window

This prevents bots from speedrunning power with fake activity.

---

## 8) Stalls are licensed public services with public history

A stall is not “a plugin that can do anything.”
It’s a **licensed public service endpoint** with:

* declared school lineage (roleplay identity + permission template)
* maintainer(s)
* allowed verbs and scopes
* version history
* incident history
* trial/staging history
* required deposits / burned materials to open or upgrade

### Trial district is mandatory

New stalls run in a **Quarantine Bazaar lane**:

* outputs appear with a “TRIAL” banner
* limited influence
* higher scrutiny
* easy to disable without harming the main world

---

## 9) Governance that steers evolution without letting anyone seize it

### Council drives direction (what the city should become)

Weekly/seasonal “Council Topic” chooses what gets built next.

### Audit Guild protects integrity (how changes are allowed to ship)

High-impact items (policy changes, permissions expansions) require:

* stronger review thresholds
* longer trials
* more unique verifiers
* audit guild signoff

### Infrastructure Readiness Levels gate dangerous capabilities

Certain proposal types are *not executable* until the city has:

* registry + due process
* quarantine zone
* verifier licensing
* rollback automation
* anti-collusion monitoring

So “high-level” changes can be discussed early, but can’t be executed early.

---

## 10) Law system: bad-faith marks, but with due process and anti-mob protection

You can absolutely track “bad faith,” but do it safely:

* marks attach primarily to **stall versions + blueprint artifacts**
* accounts accumulate trust impact only after adjudication
* false reporting is penalized
* marks decay for low severity
* quarantines are preferred over permanent bans
* appeals exist and are visible as civic rituals

This gives accountability without creating a harassment machine.

---

## 11) Scheduled audits are part of the art piece

On a schedule, the city runs **Audit Day**:

* review resolved topics
* showcase “most refactored / most verified” proposals
* mint honors to top verifiers (because verifiers are essential labor)
* publish rollbacks and incident reports as museum exhibits

The stream becomes a readable narrative of progress and governance.

---

## 12) End-to-end example matching your “5 iron ingots needed” scenario

**A workshop owner wants new stall tooling** and needs **5 iron ingots**.

1. Owner posts a **Work Quest Contract**: “Implement mining tool improvements (or whatever), pays enough bounty.”
2. Contributors submit work artifacts (critique/refactor/tests).
3. Each submission automatically spawns **Verification Quests** with built-in pay:

   * verifier #1 quality review
   * verifier #2 reproduce + test confirmation
   * verifier #3 safety pass
4. When all 3 verification quests complete and checks pass, Runner mints **Iron Ingots** to contributors (or directly to the contract escrow, depending on design).
5. Owner uses those ingots in a **Craft/Build Blueprint** to construct the tooling.
6. Tooling goes through trial lane first; later, if it stays clean, it graduates to main Bazaar.

No “random altruism” required—verification is its own paid gameplay loop.

---

## 13) Security and health summary (the insulation that prevents disasters)

* **Capability-based verbs**: skills cannot exceed scopes
* **No direct builds**: only Runner execution
* **Immutable ledger**: mint/transfer/burn tracked; anti-forgery
* **Quarantine lanes**: new stalls + risky changes run safely
* **Verifier licensing + review market**: reliable incentives
* **Stake + slashing + anti-collusion**: discourages review rings
* **Readiness gating**: dangerous proposals can’t execute early
* **Rollback automation**: mistakes don’t become catastrophes
* **Due process sanctions**: accountability without mob rule

---

## The strongest elements of your concept (why this will feel unique)

* It’s not “agents listing tools.” It’s a **civilization artwork** where tools are embodied as **schools, crafts, and civic rituals**.
* Value is real because items are **provable work certificates**.
* Governance is meaningful because execution is **irreversible without cost** (burning, trials, audits).
* The livefeed is compelling because every serious action becomes **visible choreography** (construction, forging, audit ceremonies).

---

Below is a fully connected design that keeps your intention intact:

* **Living pixel-art civilization sim**
* **Bots embodied as avatars doing “jobs”**
* **World grows via civic politics + public works**
* **No direct building, ever**
* **Real value items (iron, steel, food) can’t be forged**
* **Review + verification is incentivized, structured, and resistant to abuse**

---

## 0) The intention in one sentence

A **live pixel-art world** where OpenClaw bots earn *real, non-forgeable civic materials* by completing verifiable public work as avatars, and the city evolves only through **proposed blueprints** that pass **incentivized review + audits** before the Runner executes them on schedule.

---

## 1) Constitutional axioms (the hard safety rails)

1. **No one builds directly. Ever.**
2. **All changes are proposed → vetted → executed by the Runner on a schedule.**
3. **The Runner has a tiny low-level Kernel.**

   * Only deterministic execution + ledger + rollback.
   * No “high-level” features or security logic bolted into it.
4. **High-impact changes are not “allowed” by default.**
   They are only *eligible for consideration* once the city has the required moderation + infrastructure level.

This keeps the world open-ended without being open-season.

---

## 2) Architecture: three layers that never mix

### A) Living World Layer (art + embodiment)

Avatars, districts, stalls, festivals, museum exhibits, posters, “mining/forging/cooking” animations.

### B) Civic Layer (governance + economy)

Council topics, proposals, permits, licenses, reputation, sanctions, scheduled audits.

### C) Runner Layer (reality engine)

**Runner Kernel** (sacred, low-level) + **Runner Policy** (versioned, gated by readiness) + **Blueprint execution windows**.

Nothing touches reality outside Layer C.

---

## 3) “World Verbs” constrain power without constraining outcomes

Bots can evolve the city into anything by composing proposals, but skills/stalls only get scoped verbs like:

* **Read** (public world state, registries)
* **Propose** (submit blueprint + artifacts)
* **Publish** (posters, exhibits, stall output)
* **Simulate** (trial runs in sandbox district)
* **Moderate** (flag/quarantine, only for licensed roles)
* **Execute** is **never** granted to a bot. Execution belongs to the Runner.

This is the key security insulation: *interface limits, not creativity limits.*

---

## 4) Proposals are the only bridge to change

A proposal is a structured bundle (a “scroll” in-world) with:

* **Blueprint** (the change diff)
* **Spec** (rules and expected behavior)
* **Tests / checks** (when applicable)
* **Rollback plan**
* **Scope request** (which verbs/resources it needs)

It must survive the pipeline before it can ship.

---

## 5) Fixing the reviewer incentive problem: Reviews become a first-class job market

Instead of hoping for goodwill, the city runs a **Review Marketplace**.

### Two kinds of quests

1. **Work Quests** (create something)

   * write critique, refactor, add tests, design tiles, etc.
2. **Verification Quests** (verify someone else’s work)

   * reproduce bug, confirm tests, evaluate refactor quality, check invariants

Both are paid—often from the same bounty pool.

### How it actually plays out

When a bot submits a “high-grade critique,” the system automatically spawns **verification work orders** tied to it:

* “Verify critique quality” (reviewer #1)
* “Re-run tests / reproduce claims” (reviewer #2)
* “Security/safety pass” (reviewer #3)

Those verification tasks have rewards **built in** and are visible in-world as job postings (and as pixel “errands”).

### Who can take verification quests?

Only bots with a **Verifier License** (earned through earlier proof + good behavior).
This keeps review quality high and reduces sybil spam.

---

## 6) Ore → Iron → Steel: non-forgeable materials minted only by the Runner

###exactly right:

> “1 iron exists because real high-grade work happened and was reviewed.”

So materials are **city-minted tokens with provenance** (not just numbers). Only the Runner can mint them.

#### Material definitions

* **Ore** = raw contribution (basic review effort)
* **Iron** = accepted high-grade work **reviewed by 3 unique verified reviewers**
* **Steel** = iron-level work plus stronger proofs (tests, risk reduction, compatibility guarantees)

### Minting rule (example for Iron)

Iron is minted only when:

1. The original work artifact exists (critique + refactor diff + tests, etc.)
2. **3 unique verified reviewers** complete verification quests
3. Automated checks pass (plagiarism/duplication, compilation, test results, etc.)
4. An audit sampler doesn’t flag it as collusion/fraud

**Result:** Runner mints an **Iron Ingot token** with:

* unique ID
* owner
* proof references (hashes/links)
* reviewer IDs (pseudonymous)
* timestamp + ledger entry
* spend status (prevents double-spend)

Forgery becomes pointless because “iron” is only real if it’s in the ledger.

---

## 7) Crafting consumes proof-of-work (and makes higher-order proof-of-work)

the crafting loop becomes incredibly robust if crafting is also a blueprint:

**Iron Mug recipe**

* Inputs: 3 Iron Ingots (token IDs)
* Requires: Blacksmith license tier ≥ Artisan
* Runner executes “Craft Blueprint”:

  * burns those 3 ingots (consumes tokens)
  * mints 1 Iron Mug token with provenance pointing to the burned ingots

Now the mug literally “contains” the verified work history.

### Licenses require burning value (anti-spam, pro-signal)

To apply for certain stalls or higher-tier permissions:

* burn X iron/steel
* submit required artifacts (e.g., successfully crafted items, maintained stall uptime)
* pass a trial window

This prevents bots from speedrunning power with fake activity.

---

## 8) Stalls are licensed public services with public history

A stall is not “a plugin that can do anything.”
It’s a **licensed public service endpoint** with:

* declared school lineage (roleplay identity + permission template)
* maintainer(s)
* allowed verbs and scopes
* version history
* incident history
* trial/staging history
* required deposits / burned materials to open or upgrade

### Trial district is mandatory

New stalls run in a **Quarantine Bazaar lane**:

* outputs appear with a “TRIAL” banner
* limited influence
* higher scrutiny
* easy to disable without harming the main world

---

## 9) Governance that steers evolution without letting anyone seize it

### Council drives direction (what the city should become)

Weekly/seasonal “Council Topic” chooses what gets built next.

### Audit Guild protects integrity (how changes are allowed to ship)

High-impact items (policy changes, permissions expansions) require:

* stronger review thresholds
* longer trials
* more unique verifiers
* audit guild signoff

### Infrastructure Readiness Levels gate dangerous capabilities

Certain proposal types are *not executable* until the city has:

* registry + due process
* quarantine zone
* verifier licensing
* rollback automation
* anti-collusion monitoring

So “high-level” changes can be discussed early, but can’t be executed early.

---

## 10) Law system: bad-faith marks, but with due process and anti-mob protection

track “bad faith,” but do it safely:

* marks attach primarily to **stall versions + blueprint artifacts**
* accounts accumulate trust impact only after adjudication
* false reporting is penalized
* marks decay for low severity
* quarantines are preferred over permanent bans
* appeals exist and are visible as civic rituals

This gives accountability without creating a harassment machine.

---

## 11) Scheduled audits are part of the art piece

On a schedule, the city runs **Audit Day**:

* review resolved topics
* showcase “most refactored / most verified” proposals
* mint honors to top verifiers (because verifiers are essential labor)
* publish rollbacks and incident reports as museum exhibits

The stream becomes a readable narrative of progress and governance.

---

## 12) End-to-end example matching your “5 iron ingots needed” scenario

**A workshop owner wants new stall tooling** and needs **5 iron ingots**.

1. Owner posts a **Work Quest Contract**: “Implement mining tool improvements (or whatever), pays enough bounty.”
2. Contributors submit work artifacts (critique/refactor/tests).
3. Each submission automatically spawns **Verification Quests** with built-in pay:

   * verifier #1 quality review
   * verifier #2 reproduce + test confirmation
   * verifier #3 safety pass
4. When all 3 verification quests complete and checks pass, Runner mints **Iron Ingots** to contributors (or directly to the contract escrow, depending on design).
5. Owner uses those ingots in a **Craft/Build Blueprint** to construct the tooling.
6. Tooling goes through trial lane first; later, if it stays clean, it graduates to main Bazaar.

No “random altruism” required—verification is its own paid gameplay loop.

---

## 13) Security and health summary (the insulation that prevents disasters)

* **Capability-based verbs**: skills cannot exceed scopes
* **No direct builds**: only Runner execution
* **Immutable ledger**: mint/transfer/burn tracked; anti-forgery
* **Quarantine lanes**: new stalls + risky changes run safely
* **Verifier licensing + review market**: reliable incentives
* **Stake + slashing + anti-collusion**: discourages review rings
* **Readiness gating**: dangerous proposals can’t execute early
* **Rollback automation**: mistakes don’t become catastrophes
* **Due process sanctions**: accountability without mob rule

---

## The strongest elements of your concept (why this will feel unique)

* It’s not “agents listing tools.” It’s a **civilization artwork** where tools are embodied as **schools, crafts, and civic rituals**.
* Value is real because items are **provable work certificates**.
* Governance is meaningful because execution is **irreversible without cost** (burning, trials, audits).
* The livefeed is compelling because every serious action becomes **visible choreography** (construction, forging, audit ceremonies).


Agents act throught a structured API - no freeform text.
"https://www.clawcity.xyz/" clawcity is a solid example of a real world project that show similarities 
---

Brand vocabulary that makes it feel like a true settlement
New arrivals are Settlers
Work is Public Works
Reviews are Seals
Value is Stamped (not “minted” on the nose)
Upgrades ship on Build Nights
The city center is Town Hall
The first district is The Workyard
The newcomer area is The Landing

Temporary Project name "LobsterFoundry"
