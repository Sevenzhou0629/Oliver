# Security, Privacy & Operational Requirements

- This is a financial-data product for two private users. Obtain per-member Plaid consent and give each user visibility into sharing scope, connected institutions and deletion controls.
- Encrypt Plaid access tokens and sensitive records server-side; keep decryption keys outside database and repository.
- Verify user identity and household membership on **every** server endpoint and background job. Invitation must require intended recipient acceptance. Support member revocation.
- Prefer household-level aggregate spending; individual transaction detail should follow explicit consent level.
- Store only the data necessary for requested summaries and matches. Allow revoke/erase with a documented retention policy. Do not make implausible zero-retention claims where operational backups exist.
- Verify Plaid webhooks using current documented verification mechanism; enforce idempotency and rate limits.
- No raw account credentials or full card numbers; Plaid handles institution authentication via Link.
- LLM gets public card product names, summaries and minimum required derived spend context, not tokens, banking identifiers or unrestricted transaction history.
- Logs redact PII, merchant detail if not needed, secrets and account references. Audit changes to confirmed benefit usage and household permissions.
- Only fetch URL sources via restricted SSRF-safe service; do not execute page JS unless authorized and necessary. Treat websites as untrusted inputs to LLM.
- Sandbox credentials in dev; production keys only in protected environment variables / secret manager.
- Implement deletion tests, authorization cross-household tests, race tests for sync cursor, and basic dependency audit.
- Display understandable disclaimers: point valuations are user-configurable assumptions; actual card benefits depend on issuer terms and enrollment; transaction match is not redemption confirmation.
