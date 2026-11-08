# CardPilot — Codex Implementation Handoff

**Status:** Implementation brief; no user bank accounts have been connected; no production credentials are included.

**Goal:** A private household iOS app for two partners with many US credit cards. Discover and explain current, source-backed card benefits and promotions from official websites (USCreditCardGuide.com as secondary fallback), then use Plaid transaction data to estimate usage and recommend which card to use.

## How to hand off to Codex

1. Create a **new private GitHub repository** named `cardpilot` (do not use an unrelated existing repo).
2. Add these files to the repository, preserving directories. Alternatively, attach this ZIP or paste `CODEX_TASK.md` into a new Codex task with the repo selected.
3. In Codex Cloud, select the repository's environment and send the instruction in `CODEX_TASK.md`.
4. Start with **mock mode** (no secrets needed); configure Plaid Sandbox/OpenAI/Supabase only after the mock flow works.
5. Review the work and tests before granting production credentials.

## Files

- `CODEX_TASK.md` — direct imperative instruction to Codex
- `AGENTS.md` — engineering rules and completion criteria
- `docs/PRD.md` — user journeys, UX and acceptance criteria
- `docs/ARCHITECTURE.md` — APIs, data model, sync flows
- `docs/SOURCE_POLICY.md` — official-first retrieval, provenance and status rules
- `docs/SECURITY.md` — data protection and compliance expectations
- `docs/IMPLEMENTATION_PLAN.md` — suggested milestones and tests
- `fixtures/card-catalog.json` — non-sensitive card inventory with owners as placeholders
- `fixtures/demo-offers.json` — clearly fictional demo offers
- `fixtures/demo-transactions.json` — clearly fictional demo transactions

## Source references

- Plaid iOS Link: https://plaid.com/docs/link/ios/
- Plaid Transactions Sync: https://plaid.com/docs/api/products/transactions/#transactionssync
- Plaid transaction state handling: https://plaid.com/docs/transactions/transactions-data/
- Amex: https://www.americanexpress.com/
- Chase: https://www.chase.com/
- Atmos: https://www.alaskaair.com/
- Backup: https://www.uscreditcardguide.com/

Documentation links are research starting points; verify current terms and APIs while implementing.
