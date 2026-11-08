import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createHash } from "node:crypto";
import { verifyWebhook } from "../src/plaid.js";
test("signed webhook verifies exact body and rejects stale/tampered input", async () => {
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const jwk = await exportJWK(publicKey);
  const raw = Buffer.from('{"item_id":"synthetic"}');
  const claims = {
    request_body_sha256: createHash("sha256").update(raw).digest("hex"),
  };
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: "synthetic-key" })
    .setIssuedAt()
    .sign(privateKey);
  const getKey = async () => ({ key: jwk });
  await verifyWebhook(token, raw, getKey);
  await assert.rejects(() => verifyWebhook(token, Buffer.from("{}"), getKey));
  const stale = await new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: "synthetic-key" })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 600)
    .sign(privateKey);
  await assert.rejects(() => verifyWebhook(stale, raw, getKey));
});
