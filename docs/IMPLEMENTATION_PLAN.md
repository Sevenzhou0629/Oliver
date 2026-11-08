# Implementation Milestones & Tests

## M0 — Repo/infra ready
- Monorepo, typecheck/lint/test, Docker Postgres, migrations, seed fixture, `.env.example`, GitHub Actions backend CI and macOS iOS build CI if possible.
- Acceptance: clone + documented commands run in demo mode with no credentials.

## M1 — Demo vertical slice (must implement before credentials)
- Native SwiftUI views and navigation, typed client, mocks.
- API dashboard, cards, sources, offers, spending, recommendations.
- Benefit period recurrence and primary/AU dedupe.
- Synthetic offers and synthetic transactions clearly labeled.
- Tests: monthly cycle (including December/January), quarterly reset, semiannual boundary June/July, anniversary crossing leap year, two distinct primaries, authorized user sharing, merchant mismatch, refund, duplicate transaction.
- Acceptance: app presents useful month snapshot in demo mode.

## M2 — Plaid sandbox
- Link SDK and OAuth redirect where required, server token exchange, item/account mapping, transaction sync and webhook.
- Tests: added/modified/removed, pending->posted, paginated sync error restart, shared account reconciliation, disconnected Item.
- Acceptance: Sandbox transactions appear in Spending without duplication.

## M3 — Live public-source search agent
- Configurable source registry with official-first search and USCreditCardGuide fallback.
- Typed extraction, citations, last-verified, confidence, dates, conflict resolution, cache and request controls.
- Tests: HTML fixture extraction, expired offers, targeted offers not available-on-card, source conflicts, missing official data, prompt injection in page text, URL SSRF rejection.
- Acceptance: at least one allowed public official source checks with honest timestamp, no fabricated offers when missing.

## M4 — Digest & polish
- Monthly digest generation, future expiration reminders, member-specific notifications, empty/error states, user-configurable point valuations.
- Tests: notification dedupe, date windows and time zones, wrong-member visibility.
- Acceptance: demo can show next-month available benefits and expiry warnings, with separate observed savings.

## Reporting to user

At each milestone report changed files, commands/tests actually run, known limitations, and next decisions. Prioritize code + verifiable tests, not marketing screenshots.
