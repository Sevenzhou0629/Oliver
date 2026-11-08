import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { Store } from "../src/store.js";
const headers = { authorization: "Bearer demo-a" };
test("authenticated vertical slice, consent scopes, validation, deletion", async () => {
  const store = new Store();
  const app = await buildApp(store);
  try {
    assert.equal((await app.inject("/api/cards")).statusCode, 401);
    assert.equal(
      (await app.inject({ url: "/api/households/other/dashboard", headers }))
        .statusCode,
      403,
    );
    for (const path of [
      "/api/cards",
      "/api/offers",
      "/api/transactions",
      "/api/benefits?month=2026-11",
      "/api/sources",
      "/api/spending/summary?month=2026-11",
      "/api/households/demo/dashboard?month=2026-11",
    ])
      assert.equal(
        (await app.inject({ url: path, headers })).statusCode,
        200,
        path,
      );
    let summary = (
      await app.inject({ url: "/api/spending/summary?month=2026-11", headers })
    ).json();
    assert.equal(summary.totalMinor, 20200);
    assert.equal(
      (await app.inject({ url: "/api/benefits?month=invalid", headers }))
        .statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/sources",
          headers,
          payload: { url: "http://127.0.0.1" },
        })
      ).statusCode,
      502,
    );
    await app.inject({
      method: "PATCH",
      url: "/api/me/consent",
      headers: { authorization: "Bearer demo-b" },
      payload: { consent: "summary" },
    });
    assert.ok(
      (await app.inject({ url: "/api/transactions", headers }))
        .json()
        .transactions.every((t: any) => t.member === "person_a"),
    );
    summary = (
      await app.inject({ url: "/api/spending/summary?month=2026-11", headers })
    ).json();
    assert.equal(summary.totalMinor, 20200);
    await app.inject({
      method: "PATCH",
      url: "/api/me/consent",
      headers: { authorization: "Bearer demo-b" },
      payload: { consent: "private" },
    });
    assert.equal(
      (
        await app.inject({
          url: "/api/spending/summary?month=2026-11",
          headers,
        })
      ).json().totalMinor,
      9500,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/plaid/exchange",
          headers,
          payload: { public_token: "test", consent: false },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/plaid/webhook",
          payload: {},
        })
      ).statusCode,
      403,
    );
    await app.inject({ method: "DELETE", url: "/api/me/data", headers });
    assert.equal(
      (await app.inject({ url: "/api/cards", headers })).statusCode,
      401,
    );
    assert.ok(
      (await store.read()).transactions.every((t) => t.member !== "person_a"),
    );
  } finally {
    await app.close();
  }
});
test("rate limiting", async () => {
  const app = await buildApp(new Store());
  try {
    let last = 200;
    for (let i = 0; i < 105; i++)
      last = (await app.inject({ url: "/api/cards", headers })).statusCode;
    assert.equal(last, 429);
  } finally {
    await app.close();
  }
});
test("concurrent mutations serialized, no lost updates", async () => {
  const store = new Store();
  await store.init();
  await Promise.all(
    Array.from({ length: 20 }, () =>
      store.mutate(async (s) => {
        const n = s.audit.length;
        await Promise.resolve();
        s.audit.push({ actor: "test", action: String(n), at: "now" });
      }),
    ),
  );
  assert.equal((await store.read()).audit.length, 20);
});

test("different-household detail and cards never leak despite consent", async () => {
  const store = new Store();
  const app = await buildApp(store);
  try {
    await store.mutate((s) => {
      s.members.find((m) => m.id === "person_b")!.household = "other-household";
    });
    const response = (
      await app.inject({ url: "/api/transactions", headers })
    ).json();
    assert.ok(response.transactions.every((t: any) => t.member === "person_a"));
    const cards = (await app.inject({ url: "/api/cards", headers })).json();
    assert.ok(cards.cards.every((c: any) => c.owner === "person_a"));
    assert.equal(
      (
        await app.inject({
          url: "/api/spending/summary?month=2026-11",
          headers,
        })
      ).json().totalMinor,
      9500,
    );
  } finally {
    await app.close();
  }
});
