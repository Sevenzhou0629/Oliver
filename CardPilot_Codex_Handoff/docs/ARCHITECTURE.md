# Technical Architecture

## Stack

- iOS: SwiftUI (native), modern async/await networking, Codable models, local UI demo adapter.
- API: TypeScript 22 LTS-compatible Node, Fastify or Hono, Zod, OpenAPI; PostgreSQL + Prisma/Drizzle, migrations.
- Authentication: managed provider or Supabase Auth with robust server JWT verification; household RLS/server authorization.
- Jobs: DB-backed scheduler (e.g. pg-boss) or safe managed cron; avoid introducing Redis solely for MVP.
- AI: pluggable web search provider and structured JSON extraction; deterministic fixtures when API key missing.
- Plaid: official server SDK + iOS LinkKit.
- Deployable locally with Docker Compose for DB and a documented server command.

## Core entities (proposed)

- User(id, auth_provider_sub, display_name)
- Household(id, name, timezone)
- HouseholdMembership(household_id, user_id, role, consent_level, status)
- CardProduct(id, network, issuer, canonical_name, official_url, archived_at)
- CardAccount(id, household_id, owner_user_id, product_id, relationship_type, shared_primary_account_id nullable, anniversary_date nullable, status)
- PlaidItem(id, owner_user_id, institution_id, encrypted_access_token, cursor, last_sync_at, status)
- PlaidAccountMap(plaid_account_id, item_id, card_account_id nullable, member_verified_at)
- Transaction(id, plaid_transaction_id unique, item_id, plaid_account_id, posted_date, amount_minor, currency, merchant_name, merchant_id nullable, merchant_category, pending, pending_transaction_id nullable, status, last_synced_at)
- Source(id, household_id nullable, kind, domain, url, allowed, fetch_policy, last_checked_at)
- SourceSnapshot(id, source_id, fetched_at, content_hash, text_excerpt, url, error nullable)
- BenefitDefinition(id, card_product_id, benefit_kind, title, value_minor nullable, currency, terms_json, period_rule_json, enrollment_rule_json, source_snapshot_id, verification_status)
- BenefitPeriod(id, benefit_definition_id, card_account_id or benefit_owner_primary_account_id, starts_at, ends_at, allowance_minor nullable, confirmed_used_minor, status)
- PublicOffer(id, merchant, title, source_snapshot_id, conditions_json, start_at nullable, expires_at nullable, eligibility_scope, verification_status, terms_hash)
- OfferCardEligibility(offer_id, card_product_id, verified_for_specific_card bool default false, card_account_id nullable)
- OfferTransactionMatch(id, offer_id, transaction_id, score, reason_codes, status)
- RewardEvidence(id, transaction_id nullable, benefit_period_id nullable, offer_id nullable, kind, verified_by, evidence_ref, amount_minor, status)
- Notification(id, household_id, recipient_user_id, type, target_id, schedule_at, sent_at nullable)

Think about separate public source verification, personal eligibility, and usage state as three independent dimensions. One enum cannot represent them all.

## Initial API contract

- POST /api/households, POST /api/households/:id/invitations, POST /api/households/:id/join
- GET /api/me, GET /api/households/:id/dashboard?month=YYYY-MM
- GET /api/cards, POST /api/cards, PATCH /api/cards/:id
- GET /api/benefits?month=YYYY-MM, PATCH /api/benefit-periods/:id/confirmation
- GET /api/offers?status=&card=&merchant=, GET /api/offers/:id
- GET /api/transactions?from=&to=&account=, GET /api/spending/summary?month=
- GET /api/sources, POST /api/sources, POST /api/sources/:id/check
- POST /api/plaid/link-token, POST /api/plaid/exchange, POST /api/plaid/webhook, POST /api/plaid/:itemId/sync, DELETE /api/plaid/:itemId
- GET /api/recommendations?merchant=&category=&amount=

Endpoints above are a starting proposal. Use versioned schemas, auth guards, pagination, input validation, sensible errors and tests.

## Plaid sync specifics

- On Link success send `public_token` to backend, exchange immediately; encrypt returned long-lived token on server.
- Associate Plaid Item with consenting member, not globally with entire household.
- Call `/accounts/get`; require user confirmation of issuer product mapping (Plaid does not guarantee card SKU identity).
- Use `/transactions/sync`: retrieve `added`, `modified`, `removed`, loop with `has_more` and persist new cursor atomically with updates. If mutation during pagination, restart from the cursor from first page of batch per Plaid docs.
- Validate Plaid webhook authenticity per current docs; trigger idempotent sync in queue.
- Pending-to-posted can generate removed pending + added posted; maintain linking via `pending_transaction_id` and avoid double counting.
- A credit card payment is a transfer, not a purchase; exclude from category spending. Support refunds/negative transactions and merchant corrections.
- At-rest encryption, audit and deletion on disconnect.

## Benefit recurrence semantics

- `month`: monthly start/end in relevant TZ.
- `quarter`: Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec unless terms say otherwise.
- `half_year`: Jan-Jun, Jul-Dec unless terms say otherwise.
- `calendar_year`: Jan 1-Dec 31.
- `card_anniversary_year`: origin card anniversary; do not assume calendar year.
- `one_time`, `every_n_years`, `custom_windows` available as extensions.
- Primary and AU can generate same underlying BenefitPeriod when issuer says shared. Independent primary accounts can generate independent periods.
- BenefitPeriod need not be equal to offer validity window; keep them separate.

## Matching algorithm

1. Filter offers by date and possible eligibility, never assume private personalized availability from public source.
2. Normalize merchant text only with reason codes; account for franchise/online/merchant restrictions.
3. Match transactions by card account, merchant, date and amount with per-offer multi-transaction/one-transaction constraints.
4. Mark `candidate_match`/`possibly_used`; do not mark confirmed based solely on charge.
5. Use distinct statement credit transaction or user confirmation as `confirmed_used`, and retain evidence.

## Service boundaries

LLM may produce: extracted offer schema + source spans + ambiguities. Rule engine produces: eligibility, countdown, spending gap, expected point value. Keep logic independently unit-testable.
