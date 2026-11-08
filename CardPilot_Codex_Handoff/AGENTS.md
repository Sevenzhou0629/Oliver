# Engineering Guide for Codex

## Priorities

Correctness > data privacy > source provenance > understandable product UX > clever architecture.

## Structure and quality

- Prefer a maintainable monorepo with a TypeScript service and a native SwiftUI app.
- Use explicit types, runtime schema validation (e.g. Zod), database constraints, and structured error handling.
- Isolate external adapters: Plaid, OfferSearch, LLMParser, Notifications, Authentication.
- Rules for money, eligibility and reset dates must be deterministic code; the LLM only extracts information or explains documented offers.
- Financial calculations must use integer minor currency units or precise decimal types, never float for settlement math.
- All time-based rules have IANA timezone and period type; display in `America/Los_Angeles` by default.
- Filter all queries by authorized household membership. Explicit member consent required for shared spending analytics.
- All tests should use synthetic, non-identifying data.
- Document every external credential required in `.env.example`; never fill with real values.
- User visible information must distinguish verified, likely, reported, unavailable and stale states.
- Avoid hallucinated source URLs and hard-coded benefits. Public pages may change; store version and as-of time.

## Do not

- Automate unauthorized Amex/Chase sign-ins.
- Scrape pages contrary to access restrictions.
- Use a screenshot-only workflow as the essential path.
- Create duplicate household benefits for authorized-user cards.
- Assert that matching a charge automatically triggers an issuer statement credit.
- Make up actual offers or card values in production.

## Deliver each coding pass with

1. Implemented files.
2. Commands run and actual test results.
3. Remaining blocks/credentials and security limitations.
4. Concise next steps for the owner.
