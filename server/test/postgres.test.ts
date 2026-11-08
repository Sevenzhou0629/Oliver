import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.js";
test(
  "PostgreSQL persists state and serializes independent connections",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const a = new Store(process.env.TEST_DATABASE_URL);
    const b = new Store(process.env.TEST_DATABASE_URL);
    await a.init();
    await b.init();
    try {
      const key = crypto.randomUUID();
      await Promise.all(
        [a, b].map((s) =>
          s.mutate(async (state) => {
            state.audit.push({
              actor: key,
              action: "concurrent",
              at: new Date().toISOString(),
            });
          }),
        ),
      );
      assert.equal(
        (await a.read()).audit.filter((x) => x.actor === key).length,
        2,
      );
    } finally {
      await a.close();
      await b.close();
    }
  },
);

test(
  "PostgreSQL rolls back failed writes and encrypts persisted state",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const store = new Store(process.env.TEST_DATABASE_URL);
    await store.init();
    const previous = process.env.TOKEN_ENCRYPTION_KEY;
    const key = "12".repeat(32);
    try {
      const count = (await store.read()).audit.length;
      await assert.rejects(() =>
        store.mutate((s) => {
          s.audit.push({
            actor: "rollback",
            action: "should-not-commit",
            at: "now",
          });
          throw Error("synthetic failure");
        }),
      );
      assert.equal((await store.read()).audit.length, count);
      process.env.TOKEN_ENCRYPTION_KEY = key;
      await store.mutate((s) => {
        s.audit.push({ actor: "encryption-test", action: "write", at: "now" });
      });
      const raw = (
        await store.pool!.query("SELECT payload FROM app_state WHERE id=1")
      ).rows[0].payload;
      assert.equal(typeof raw.encrypted, "string");
      assert.ok(!JSON.stringify(raw).includes("person_a"));
      assert.equal((await store.read()).members.length, 2);
      // Restore the isolated test database to plaintext demo state before removing its key.
      const plain = await store.read();
      await store.pool!.query("UPDATE app_state SET payload=$1 WHERE id=1", [
        plain,
      ]);
    } finally {
      if (previous === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
      else process.env.TOKEN_ENCRYPTION_KEY = previous;
      await store.close();
    }
  },
);
