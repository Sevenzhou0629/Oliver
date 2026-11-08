import test from "node:test";
import assert from "node:assert/strict";
import {
  windowFor,
  benefitOwner,
  reconcile,
  spending,
  match,
  Offer,
  type Card,
  type Transaction,
} from "../src/domain.js";
import { seal, unseal, syncPages } from "../src/plaid.js";
import { safeURL } from "../src/discovery.js";
const tx: Transaction = {
  id: "pending",
  member: "person_a",
  merchant: "Hotel",
  amountMinor: 20000,
  currency: "USD",
  date: "2026-11-07",
  pending: true,
  category: "travel",
};
for (const [cycle, date, start, end] of [
  ["month", "2026-12-31", "2026-12-01", "2027-01-01"],
  ["quarter", "2026-03-31", "2026-01-01", "2026-04-01"],
  ["quarter", "2026-04-01", "2026-04-01", "2026-07-01"],
  ["half_year", "2026-06-30", "2026-01-01", "2026-07-01"],
  ["half_year", "2026-07-01", "2026-07-01", "2027-01-01"],
  ["calendar_year", "2026-11-07", "2026-01-01", "2027-01-01"],
] as const)
  test(`${cycle} ${date}`, () => {
    const w = windowFor(date, cycle);
    assert.equal(w.startsAt.slice(0, 10), start);
    assert.equal(w.endsAt.slice(0, 10), end);
  });
test("DST uses local calendar boundaries", () => {
  const w = windowFor("2026-03-15", "month");
  assert.ok(w.startsAt.endsWith("-08:00"));
  assert.ok(w.endsAt.endsWith("-07:00"));
});
test("Leap anniversary restores Feb 29 in leap year", () => {
  const w = windowFor(
    "2024-02-28",
    "card_anniversary_year",
    undefined,
    "2020-02-29",
  );
  assert.equal(w.startsAt.slice(0, 10), "2023-02-28");
  assert.equal(w.endsAt.slice(0, 10), "2024-02-29");
});
test("Independent primaries distinct; AU shares", () => {
  const a: Card = {
    id: "a",
    owner: "a",
    productId: "platinum",
    displayName: "P",
    relationship: "primary",
  };
  const b = { ...a, id: "b" };
  const au: Card = {
    ...a,
    id: "au",
    relationship: "authorized_user",
    primaryId: "a",
  };
  assert.notEqual(benefitOwner(a, true), benefitOwner(b, true));
  assert.equal(benefitOwner(a, true), benefitOwner(au, true));
  assert.equal(benefitOwner(au, false), "au");
});
test("idempotent pending -> posted, modifications/removals, transfers/refunds", () => {
  const posted = {
    ...tx,
    id: "posted",
    pending: false,
    pendingTransactionId: "pending",
  };
  let result = reconcile([tx], [posted, posted]);
  assert.equal(result.length, 1);
  result = reconcile(result, [{ ...posted, amountMinor: 21000 }]);
  assert.equal(spending(result, "2026-11"), 21000);
  result = reconcile(result, [
    { ...posted, id: "refund", amountMinor: -1000 },
    { ...posted, id: "payment", category: "transfer" },
  ]);
  assert.equal(spending(result, "2026-11"), 20000);
  assert.equal(reconcile(result, [], ["posted"]).length, 2);
});
test("matching never confirms personal eligibility or redemption", () => {
  const o = Offer.parse({
    id: "o",
    merchant: "Hotel",
    title: "Demo",
    minimumSpendMinor: 20000,
    expiresAt: "2026-12-01",
    sourceUrl: "https://example.com",
    sourceKind: "demo",
    verificationStatus: "mock_only",
    targeted: true,
    personalEligibility: "unknown",
    enrollmentRequired: true,
  });
  assert.equal(match(o, [tx]).usage, "unused");
  assert.equal(match(o, [{ ...tx, pending: false }]).usage, "possibly_used");
  assert.equal(o.personalEligibility, "unknown");
  assert.equal(
    match(o, [{ ...tx, pending: false, merchant: "Different" }]).usage,
    "unused",
  );
  assert.equal(
    match(o, [{ ...tx, pending: false, amountMinor: -20000 }]).usage,
    "unused",
  );
  assert.equal(
    match(o, [{ ...tx, pending: false, date: "2027-01-01" }]).usage,
    "unused",
  );
});
test("AES GCM rejects wrong key and tampering", () => {
  const key = "ab".repeat(32);
  const encrypted = seal("private-token", key);
  assert.equal(unseal(encrypted, key), "private-token");
  assert.throws(() => unseal(encrypted, "cd".repeat(32)));
  assert.ok(!encrypted.includes("private-token"));
});
test("SSRF URL restrictions", () => {
  for (const url of [
    "http://www.chase.com",
    "https://127.0.0.1",
    "https://www.chase.com.evil.test",
    "https://www.chase.com:8443",
    "https://user:pass@www.chase.com",
  ])
    assert.throws(() => safeURL(url));
  assert.equal(safeURL("https://www.chase.com/").hostname, "www.chase.com");
});
test("pagination mutation restarts from original cursor without partial updates", async () => {
  const cursors: unknown[] = [];
  let calls = 0;
  const result = await syncPages(
    "token",
    "person_a",
    "item",
    [],
    "original",
    async (_path, body) => {
      cursors.push(body.cursor);
      calls++;
      if (calls === 2)
        throw Object.assign(Error("mutation"), {
          code: "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION",
        });
      return {
        added: [],
        modified: [],
        removed: [],
        next_cursor: "next",
        has_more: calls === 1,
      };
    },
  );
  assert.deepEqual(cursors, ["original", "next", "original"]);
  assert.equal(result.cursor, "next");
});
