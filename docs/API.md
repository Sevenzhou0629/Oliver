# API v1 (MVP)

Every `/api` endpoint requires a Bearer token except the signed Plaid webhook. Mock tokens: `demo-a`, `demo-b`. Provider subjects come from verified JWTs, never a request member ID. `/health` returns `apiVersion: 1`.

| Method/path | Input / behavior |
| --- | --- |
| GET `/api/me` | Authenticated member, sharing scope, mode |
| POST `/api/households` | `{name}`; creates private membership for a new subject |
| POST `/api/households/:id/invitations` | `{recipient}`: intended recipient JWT subject; returns unguessable invitation ID; delivery is manual |
| POST `/api/households/:id/join` | `{invitationId,consent:true}`; recipient-bound acceptance, max 2 members |
| GET `/api/households/:id/dashboard?month=YYYY-MM` | Authorized household spending, personal attested rewards and card counts |
| GET/POST `/api/cards` | List scoped cards; create `{productId,displayName,relationship,primaryId?,anniversary?}` |
| PATCH `/api/cards/:id` | Owner-only `{anniversary}` |
| GET `/api/benefits?month=` | Real period boundaries and deduplicated underlying benefit owners |
| PATCH `/api/benefit-definitions/:id` | Mock only: `{productId,title,allowanceMinor,cycle,timezone?,sharedWithAU,enrollmentRequired,verificationStatus:"mock_only"}` |
| PATCH `/api/benefit-periods/:encodedId/confirmation?month=` | Primary-owner attestation `{confirmed,amountMinor}` |
| GET `/api/offers?merchant=` | Separate verification, personal eligibility, freshness and usage states |
| GET `/api/offers/:id` | Terms, fictional fixture source URL where relevant, matching reason |
| PATCH `/api/offers/:id/confirmation` | Personal reward attestation `{confirmed,amountMinor}`; never confirms personal availability |
| GET `/api/transactions?month=&offset=&limit=` | Owner data plus detail-consenting peers only; max 100 per page |
| GET `/api/spending/summary?month=` | Summary-consenting peers included in totals; pending/transfers excluded; refunds subtract |
| GET `/api/recommendations?amountMinor=&pointsPerDollar=&pointValueMinor=` | Configurable flat earning/value comparison; category/cap rules unverified |
| GET/POST `/api/sources` | Public registry; `{url}` adds a disabled permitted-host source scoped to the member's household |
| POST `/api/sources/:id/check` | Approved public check, evidence or honest unavailable reason |
| GET `/api/discovery/search?q=` | Official-first Brave discovery; no credentials = empty results |
| PATCH `/api/me/consent` | `{consent:"private"|"summary"|"detail"}` |
| DELETE `/api/me/data` | Disconnect owned Items, erase member data, revoke membership |
| POST `/api/plaid/link-token` | New Sandbox Link token |
| POST `/api/plaid/exchange` | `{public_token,consent:true}`; encrypted server token, safe account descriptions |
| GET `/api/plaid/items` | Own Item IDs only |
| GET `/api/plaid/:id/accounts` | Own account descriptions, mapping-required state |
| POST `/api/plaid/:id/mapping` | `{accountId,cardId,confirmed:true}`; owner-only, canonical shared-account dedup |
| POST `/api/plaid/:id/reconnect` | Own Item update-mode Link token |
| POST `/api/plaid/:id/sync` | Paginated added/modified/removed updates and cursor committed atomically |
| DELETE `/api/plaid/:id` | Provider removal, local token/transactions/map deletion |
| POST `/api/plaid/webhook` | Exact raw-body ES256, issued-at age and SHA256 verification; idempotent sync |
| GET `/api/notifications` | Deduplicated recipient-only local jobs/inbox |
| POST `/api/digest?month=` | Regenerate scoped spending and period summary |

Cycles: `month`, `quarter`, `half_year`, `calendar_year`, `card_anniversary_year`. Period end is exclusive. Calendar operations use IANA zones. Anniversary calculations clamp Feb 29 to Feb 28 in nonleap years and restore Feb 29 in leap years.

Errors return a redacted `{error}` with HTTP 400/401/403/404/409/429/502. Some unsupported source failures deliberately return a successful response with `status:unavailable`, so missing evidence is a visible product state. This initial contract uses Zod runtime request/domain validation and Swift Codable response models; generated OpenAPI/client version negotiation is future work.
