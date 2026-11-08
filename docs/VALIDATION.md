# Validation and limitations

## Actually executed in this implementation pass

- Read `AGENTS.md`, `CODEX_TASK.md`, every original `docs/*.md`, and all supplied JSON fixtures before coding. Originals remain in `CardPilot_Codex_Handoff/`.
- Installed dependencies with the bundled Node v24.22.1 and temporary npm 10.9.2 (npm was initially absent from PATH).
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit` — passed.
- Started an isolated ephemeral PostgreSQL 18 instance from the public `@embedded-postgres/darwin-arm64` test binary under `/tmp`, listening only on 127.0.0.1:55432. No downloaded binary is committed. Docker Compose targets PostgreSQL 16. GitHub backend CI subsequently passed migration and the complete suite on PostgreSQL 16.
- Migration: `DATABASE_URL=postgres://cardpilot@127.0.0.1:55432/postgres node node_modules/tsx/dist/cli.mjs server/src/migrate.ts` — passed.
- Suite: `TEST_DATABASE_URL=postgres://cardpilot@127.0.0.1:55432/postgres node node_modules/tsx/dist/cli.mjs --test server/test/*.test.ts` — **27 passed, 0 failed, 0 skipped**. Database coverage includes two independent connections, rollback and encrypted payload round trip. Without TEST_DATABASE_URL the two database tests explicitly skip.
- `npm audit --omit=dev` — zero vulnerabilities at execution time.
- Started the real HTTP server, requested dashboard and spending via curl with both demo identities: returned 19 cards and 20,200 cents posted spending, 0 confirmed cents, 1 candidate match. No pending hotel charge counted.
- Swift sources parsed/formatted with the installed standalone `swift-format`. This is syntax/format verification, **not an iOS typecheck or build**.
- `/usr/bin/swift --version` and system Git were blocked by the unaccepted Xcode license. Used the bundled standalone Git for repository operations. No license acceptance or system configuration was changed. Simulator capture and iOS build remain unverified locally. GitHub macOS CI subsequently passed XcodeGen and the full iOS simulator build, including LinkKit 7.3.1.
- Attempted the restricted public collector against the official Amex Platinum URL: returned `unavailable` / `fetch failed`. No terms or offers were inferred. Seed source checks remain access-policy gated. No live LLM or Plaid API calls were made without credentials.

GitHub CI evidence: [successful backend/PostgreSQL and iOS build](https://github.com/Sevenzhou0629/Oliver/actions/runs/42493198462), commit `226eedf37bc4c2581dfa55cfc774159a61086614`.

## Implemented boundaries

- Offer source verification, eligibility, freshness and observed usage are independent fields. Public targeted reporting never changes personal eligibility. Matching produces `possibly_used` only. A user attestation is audited and scoped to that user; a shared benefit's underlying primary owner attests the balance.
- All money arithmetic uses integer minor units. Recurrence uses Luxon IANA calendar arithmetic and exclusive end boundaries. Values in demo benefit definitions are synthetic and visibly `mock_only`.
- API authorization derives member subjects from verified JWTs or mock-only bearer credentials. Peer detail requires detail consent; aggregate spending accepts summary consent. Household membership always filters card/transaction access. Invitation acceptance is bound to the intended subject.
- Source collector pins a checked public IPv4 DNS address into its connection, rejects private destinations and redirects, limits body size, and never executes page scripts/instructions. Exact approved hosts only. Robots handling is deliberately conservative.
- Provider mode requires a database and encryption/JWKS settings. State is AES-GCM envelope encrypted; tokens have an additional envelope. Secrets and private payloads are absent from application logs and error responses.
- Plaid sync restarts the whole pagination batch on mutation, reconciles pending IDs/removals/modifications and atomically persists transactions/cursor. Shared mapped primary/AU accounts use one import owner. Unmapped provider transactions are withheld from totals.

## Material remaining limitations

This is a reviewable MVP slice, **not a production-ready financial service**.

1. iOS simulator compilation passed in GitHub CI; interactive simulator/device testing and live Sandbox/LLM provider tests still require Xcode and credentials. Link OAuth requires a real associated domain, registered redirect and AASA deployment. The app uses a manual development JWT input; production authentication UI/Keychain refresh is not implemented.
2. PostgreSQL stores a small-household aggregate in one locked row. Normalized tables, RLS, fine-grained constraints, migration version tracking and scalable jobs/outbox are needed before multi-tenant production. Do not deploy the development Compose password or trusted ephemeral test instance.
3. Discovery search and public extraction adapters work as callable components, but monetary terms remain `needs_review`. A complete human review/publish interface and officially verified benefit catalog are not included. No real issuer benefits are seeded. Conflicting reports are not automatically resolved into published offers.
4. Source approval is operator-only. Strict robots gating can reject otherwise permissible public pages. Search queries initially cover Amex/Chase/BofA with backup fallback; the fetch registry supports additional approved issuer/partner hosts. No authenticated-page collection is supported.
5. Recommendations use explicit configurable flat-rate assumptions. Product-specific category caps, portals and personalized activation economics are not yet populated. The UI focuses on the fixture month and simple totals, without a full 12-month chart.
6. Daily checks and weekly/monthly/expiry inbox jobs are persisted and deduplicated; delivery is local. Weekly checks request review rather than claiming refreshed verification. Monthly full summaries are available through the digest endpoint. APNs and durable distributed queues are future work.
7. Webhooks synchronously execute idempotent sync, with a bounded retry/restart loop; durable enqueue and redelivery observability remain necessary for production. Some external calls occur under the aggregate lock, intentionally limiting throughput.
8. Disconnect and erase call Plaid before committing local deletion. An external success followed by DB failure can require operator reconciliation; a transactional outbox is still needed. Operational backups can retain prior encrypted records under the deployment's retention policy; deletion does not imply zero backup retention.
9. Ownership, consent, date/reset and transaction logic have synthetic tests. No claim is made that a transaction match guarantees an issuer credit, that public reporting is personally available, or that assumed point values are guaranteed redemption cash.
