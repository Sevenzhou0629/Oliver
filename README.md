# CardPilot

Native SwiftUI household card companion with a TypeScript API. This first MVP slice runs without provider credentials. All supplied offers, transactions, ownership assignments, and demo benefit amounts are synthetic; they are never presented as current issuer terms.

## Run the demo

Requires Node 22+ and npm. From the repository root:

```sh
make demo
```

The API listens on `http://127.0.0.1:3000`. In-memory mode resets on restart. To run PostgreSQL with migrations and the same seeded household (Docker required):

```sh
make demo-db
```

Do not use the Compose development password outside localhost. No `.env` is automatically loaded: export variables in your shell or use `node --env-file=.env --import tsx server/src/index.ts` after copying `.env.example`.

```sh
curl -H 'Authorization: Bearer demo-a' \
  'http://127.0.0.1:3000/api/households/demo/dashboard?month=2026-11'
curl -H 'Authorization: Bearer demo-b' \
  'http://127.0.0.1:3000/api/transactions?month=2026-11'
```

Expected initial posted spending: **$202.00**, excluding the pending $200 hotel charge. Two mock users (`demo-a`, `demo-b`) explicitly model a consenting synthetic household. They are disabled in provider mode.

## Open the iOS app

On a Mac with Xcode 16.1+ and its license accepted:

```sh
brew install xcodegen
cd ios
xcodegen generate
open CardPilot.xcodeproj
```

Run the `CardPilot` scheme on an iOS 17+ simulator while the API runs. Home, Discover, Spending, Wallet and Settings use the API through Codable models. Settings switches demo members, changes transaction-sharing consent, checks sources, connects Plaid, and erases member data. Wallet includes a transparent flat-rate purchase comparison. Offer and benefit details support explicit reward attestations. No screenshots are included because local Xcode compilation/simulator launch was unavailable; the [macOS simulator build passed in CI](https://github.com/Sevenzhou0629/Oliver/actions/runs/42493198462).

The simulator uses localhost. For a physical device, deploy the API behind HTTPS and set its URL in Settings. Provider JWT input is memory-only development tooling; a shipped app needs an identity-provider sign-in flow and Keychain token storage. The UI is optimized for the seeded household/month; Settings includes development household invitation acceptance and account-mapping screens; full identity-provider sign-in remains future work. See [API.md](docs/API.md).

## Verification

```sh
npm ci
npm run typecheck
npm test
npm audit --omit=dev
# With an isolated PostgreSQL database:
DATABASE_URL=postgres://... npm run migrate
TEST_DATABASE_URL=postgres://... npm test
```

See [validation and implementation limits](docs/VALIDATION.md) for actual execution results. Tests cover recurrence/DST/leap days, primary/AU sharing, mutable benefit schedules, user attestations, matching, pending/posted changes, pagination restart, encrypted secrets, webhook signatures, auth/consent, rate limits, deletion, account ownership, shared-account mapping, scheduling and database concurrency. Tests use only synthetic data.

## Provider adapters

Copy `.env.example` and supply only your own Sandbox credentials. Set `MODE=providers`, `DATABASE_URL`, `TOKEN_ENCRYPTION_KEY` (32 random bytes encoded as 64 hex characters), `JWT_ISSUER`, `JWT_AUDIENCE`, and an HTTPS `JWKS_URL`. Provider mode strips demo members/cards/offers and requires verified JWT subjects with explicit household membership. Use a separate database from the demo. All persisted state is envelope-encrypted with AES-256-GCM when the encryption key is present, and Plaid tokens are separately encrypted. Keep keys outside the database and repository; losing the key loses access to encrypted state.

Plaid is **Sandbox-only**. The server uses the official SDK's supported legacy API surface. LinkKit 7.3.1 uses Swift Package Manager. Set `PLAID_REDIRECT_URI` and `PLAID_WEBHOOK_URL`; OAuth institutions additionally require your registered HTTPS Universal Link, Associated Domains entitlement and hosted AASA file. Those account-specific deployment values are not fabricated here. Link token, exchange, accounts, manual mapping, reconnect, sync, disconnect and signed webhooks have server adapters. After mapping, sync again to classify imported transactions. Unmapped provider transactions are withheld from spending totals. A shared primary/AU account has one import owner; duplicate canonical mappings are rejected. Plaid does not provide personal issuer offers or redemption confirmation.

The discovery adapter uses Brave Search (official domains first, USCreditCardGuide only when official results are missing), restricted public fetches and OpenAI JSON extraction with Zod validation. No keys means an honest unavailable state. Set `BRAVE_SEARCH_API_KEY`, `OPENAI_API_KEY`, and optionally `OPENAI_MODEL`. Sources begin disabled pending access-policy review. An operator can approve a registry entry only after reviewing public access permission:

```sh
DATABASE_URL=postgres://... npm run source:approve -- amex --access-policy-reviewed
```

Approval does not override robots or access controls: the collector conservatively rejects any robots `Disallow`, missing robots policy, redirects, non-text content, oversized bodies and private DNS destinations. It does not execute JavaScript or log in to banks. Extraction records a URL, time, content hash, excerpt and ambiguities; results remain **needs_review** rather than auto-publishing speculative financial terms. There is no personal-availability inference. Daily checks, weekly review requests, monthly digest notifications and near-expiry reminders are deduplicated in the local inbox; no APNs integration is claimed.

## Deployment and remaining work

Deploy the Node process behind an HTTPS reverse proxy, with PostgreSQL on a private network, an external secret manager, JWKS identity provider and encrypted backups. The current single-row aggregate uses transactional row locks for atomic sync/cursor commits and small-household simplicity. It is intentionally not a horizontally scalable or production-audited multi-tenant schema. See [SECURITY.md](docs/SECURITY.md) and [VALIDATION.md](docs/VALIDATION.md) before using actual personal financial data.

Phase 2: normalized per-member PostgreSQL tables/RLS and key rotation; full identity-provider sign-in and richer product catalog onboarding; verified benefit catalog and source-review publishing workflow; richer category/cap/portal earning rules; 12-month charts; durable queued webhooks and transactional outbox for external deletion; APNs; issuer evidence import; end-to-end Sandbox and simulator tests. Original requirements remain preserved under `CardPilot_Codex_Handoff/`.
