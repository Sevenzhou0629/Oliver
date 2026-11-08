# Source Discovery & Verification Policy

## Priority

1. Card issuer official benefits / offers public pages: Amex, Chase, BofA/Atmos, Citi, U.S. Bank, Barclays, Capital One.
2. Loyalty program official public sources: Alaska/Hawaiian/Atmos, Hilton, Hyatt, Marriott, Delta.
3. `https://www.uscreditcardguide.com/` as backup discovery/context, not authoritative eligibility.
4. Arbitrary user-supplied URL only if publicly accessible and allowed under its access policy.

## Source extraction schema

- source_url, fetched_at, published_at_if_known, content_hash, source_kind `issuer_official|partner_official|backup_report|user_supplied`
- applicable_card_product_ids, exact issuer product name
- merchant, spend_threshold, reward_amount, reward_type, purchase_channel, country restrictions
- activation_required, multiple_transactions_allowed, timeframe/start/end, reward_cap
- `targeted_offer` boolean, `personal_enrollment_verified` boolean or null
- verbatim small evidence excerpt, ambiguity flags, extraction_confidence
- versioning: terms changed, removed, superseded, expired

## Verify & show

- `official_verified`: official page with matching terms and dates.
- `reported_public`: seen on backup, official terms unavailable; eligible-cardholder status unknown.
- `targeted_eligibility_unknown`: some users may receive offer; don't show as "my available".
- `available_on_card`: only if verified via a legitimate authorized personal-account source or explicit user confirmation.
- `stale`: missed refresh or old evidence; clearly show last verified date.
- `expired`: based on official terms and local date/time.

Data availability and usage/redemption are separate dimensions. `possibly_used` only means matching spend; `confirmed_used` requires statement credit/issuer confirmation or user attestation.

## Restrictions

- Respect applicable terms, robots and access controls. No background bot login to bank websites, no credential reuse, no CAPTCHA/MFA evasion.
- Do not automatically download authenticated pages absent specific approved integration.
- Do not give LLM tool execution rights based on retrieved page text (prompt injection prevention).
- Apply domain allowlist and anti-SSRF checks (DNS rebinding, redirects, private/local networks) to custom URLs.
- Rate limit, cache, retry carefully, record transient failures; avoid overstating currentness.
- Cite official URL in each displayed benefit, backup URL when information is only reported.

## Search design

- Search queries derive from known issuer/card product and user-specified merchant.
- Search only approved source domains first; USCreditCardGuide is fallback.
- Validate LLM extraction against schema and source evidence; reject invented dates, dollar values or links.
- Agent should summarize conflicts rather than silently select a more generous offer.
