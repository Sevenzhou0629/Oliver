import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { buildApp } from "../src/app.js";
import { Store } from "../src/store.js";
test("provider JWT verification and recipient-bound household invitation", async () => {
  const pair = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: "synthetic",
    alg: "RS256",
    use: "sig",
  };
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;
  const vars = [
    "DATABASE_URL",
    "JWKS_URL",
    "JWT_ISSUER",
    "JWT_AUDIENCE",
    "TOKEN_ENCRYPTION_KEY",
  ] as const;
  const saved = Object.fromEntries(vars.map((k) => [k, process.env[k]]));
  Object.assign(process.env, {
    DATABASE_URL: "unused-test-store",
    JWKS_URL: `http://127.0.0.1:${port}`,
    JWT_ISSUER: "synthetic-issuer",
    JWT_AUDIENCE: "cardpilot-test",
    TOKEN_ENCRYPTION_KEY: "12".repeat(32),
  });
  const token = async (sub: string, audience = "cardpilot-test") =>
    new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "synthetic" })
      .setSubject(sub)
      .setIssuer("synthetic-issuer")
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(pair.privateKey);
  const app = await buildApp(new Store(), "providers");
  try {
    const a = { authorization: `Bearer ${await token("identity-a")}` };
    const b = { authorization: `Bearer ${await token("identity-b")}` };
    const c = { authorization: `Bearer ${await token("identity-c")}` };
    assert.equal(
      (
        await app.inject({
          url: "/api/cards",
          headers: { authorization: "Bearer demo-a" },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/households",
          headers: {
            authorization: `Bearer ${await token("identity-a", "wrong-audience")}`,
          },
          payload: { name: "Synthetic" },
        })
      ).statusCode,
      401,
    );
    const created = await app.inject({
      method: "POST",
      url: "/api/households",
      headers: a,
      payload: { name: "Synthetic" },
    });
    assert.equal(created.statusCode, 200);
    const id = created.json().id;
    const invited = await app.inject({
      method: "POST",
      url: `/api/households/${id}/invitations`,
      headers: a,
      payload: { recipient: "identity-b" },
    });
    assert.equal(invited.statusCode, 200);
    const invitationId = invited.json().id;
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/households/${id}/join`,
          headers: c,
          payload: { invitationId, consent: true },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/households/${id}/join`,
          headers: b,
          payload: { invitationId, consent: true },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await app.inject({ url: "/api/me", headers: b })).json().member.consent,
      "private",
    );
    assert.equal(
      (await app.inject({ url: "/api/cards", headers: a })).json().cards.length,
      0,
    );
  } finally {
    await app.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const key of vars)
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
  }
});
