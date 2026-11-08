import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { Store } from "../src/store.js";
const a = { authorization: "Bearer demo-a" },
  b = { authorization: "Bearer demo-b" };
test("Plaid item owner access, explicit mapping, shared account reconciliation and deletion", async () => {
  const app = await buildApp(new Store());
  try {
    const exchange = (
      await app.inject({
        method: "POST",
        url: "/api/plaid/exchange",
        headers: a,
        payload: { public_token: "synthetic", consent: true },
      })
    ).json();
    const id = exchange.itemId;
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/plaid/${id}/sync`,
          headers: b,
        })
      ).statusCode,
      404,
    );
    const card = (await app.inject({ url: "/api/cards", headers: a }))
      .json()
      .cards.find(
        (c: any) =>
          c.productId === "world_of_hyatt" && c.relationship === "primary",
      );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/plaid/${id}/mapping`,
          headers: a,
          payload: {
            accountId: "mock-account",
            cardId: card.id,
            confirmed: true,
          },
        })
      ).statusCode,
      200,
    );
    const other = (
      await app.inject({
        method: "POST",
        url: "/api/plaid/exchange",
        headers: b,
        payload: { public_token: "synthetic-b", consent: true },
      })
    ).json();
    const au = (await app.inject({ url: "/api/cards", headers: b }))
      .json()
      .cards.find((c: any) => c.primaryId === card.id);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/plaid/${other.itemId}/mapping`,
          headers: b,
          payload: {
            accountId: "mock-account",
            cardId: au.id,
            confirmed: true,
          },
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/plaid/${id}`,
          headers: b,
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/plaid/${id}`,
          headers: a,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/plaid/${id}/sync`,
          headers: a,
        })
      ).statusCode,
      404,
    );
  } finally {
    await app.close();
  }
});
