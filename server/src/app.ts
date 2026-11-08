import { DateTime } from "luxon";
import { Definition, BenefitConfirmation } from "./contracts.js";
import { planJobs } from "./jobs.js";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { Store, type State, type Member } from "./store.js";
import { spending, match, windowFor, benefitOwner } from "./domain.js";
import { plaid, seal, unseal, syncPages, verifyWebhook } from "./plaid.js";
import { checkSource, safeURL, searchPublic } from "./discovery.js";
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const fail = (statusCode: number, message: string) =>
  Object.assign(Error(message), { statusCode });
export async function buildApp(
  store = new Store(process.env.DATABASE_URL),
  mode = process.env.MODE ?? "mock",
) {
  if (process.env.NODE_ENV === "production" && mode === "mock")
    throw Error("Mock mode is disabled in production");
  if (
    mode !== "mock" &&
    (!process.env.DATABASE_URL ||
      !process.env.JWKS_URL ||
      !process.env.JWT_ISSUER ||
      !process.env.JWT_AUDIENCE ||
      !process.env.TOKEN_ENCRYPTION_KEY)
  )
    throw Error(
      "Provider authentication and encryption configuration required",
    );
  await store.init();
  if (mode !== "mock")
    await store.mutate((s) => {
      s.offers = s.offers.filter((o) => o.sourceKind !== "demo");
      s.cards = s.cards.filter((c) => !c.owner.startsWith("person_"));
      s.transactions = s.transactions.filter(
        (t) => !t.member.startsWith("person_"),
      );
      s.members = s.members.filter((m) => !m.id.startsWith("person_"));
      s.definitions = s.definitions?.filter(
        (d) => d.verificationStatus !== "mock_only",
      );
    });
  const app = Fastify({ logger: false, bodyLimit: 65536 });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  app.decorateRequest("member", null);
  const jwks =
    mode !== "mock"
      ? createRemoteJWKSet(new URL(process.env.JWKS_URL!))
      : undefined;
  app.setErrorHandler((err, _req, reply) => {
    const e = err as any;
    const code = e instanceof z.ZodError ? 400 : (e.statusCode ?? 502);
    reply.code(code).send({
      error:
        code === 400
          ? "Invalid request"
          : code === 401
            ? "Authentication required"
            : code === 403
              ? "Access denied"
              : code === 404
                ? "Not found"
                : code === 429
                  ? "Too many requests"
                  : "Operation unavailable",
    });
  });
  // Preserve exact bytes for signed webhook verification.
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      (req as any).rawBody = body;
      try {
        done(null, JSON.parse(body.toString()));
      } catch {
        done(fail(400, "Invalid JSON"), undefined);
      }
    },
  );
  app.addHook("preHandler", async (req) => {
    if (req.url === "/health" || req.url === "/api/plaid/webhook") return;
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    let id: string | undefined;
    if (mode === "mock")
      id =
        token === "demo-a"
          ? "person_a"
          : token === "demo-b"
            ? "person_b"
            : undefined;
    else if (token) {
      try {
        const { payload } = await jwtVerify(token, jwks!, {
          issuer: process.env.JWT_ISSUER,
          audience: process.env.JWT_AUDIENCE,
          algorithms: ["RS256", "ES256"],
        });
        id = payload.sub;
      } catch {
        throw fail(401, "Invalid token");
      }
    }
    const member = (await store.read()).members.find((m) => m.id === id);
    if (!id) throw fail(401, "Unknown member");
    if (
      !member &&
      req.url !== "/api/households" &&
      !/^\/api\/households\/[^/]+\/join$/.test(req.url)
    )
      throw fail(401, "Membership required");
    (req as any).member = member ?? { id, household: "", consent: "private" };
  });
  app.addHook("onClose", () => store.close());
  const member = (r: any): Member => r.member;
  const scoped = (s: State, m: Member, detail = false) =>
    s.transactions.filter(
      (t) =>
        (mode === "mock" || !!t.cardId) &&
        (t.member === m.id ||
          s.members.some(
            (other) =>
              other.id === t.member &&
              other.household === m.household &&
              (detail
                ? other.consent === "detail"
                : other.consent !== "private"),
          )),
    );
  const cards = (s: State, m: Member) =>
    s.cards.filter((c) =>
      s.members.some(
        (other) => other.id === c.owner && other.household === m.household,
      ),
    );
  const month = (q: any) =>
    monthSchema.parse(
      q.month ??
        DateTime.now().setZone("America/Los_Angeles").toFormat("yyyy-MM"),
    );
  const audit = (s: State, m: Member, action: string) =>
    s.audit.push({ actor: m.id, action, at: new Date().toISOString() });
  app.get("/health", () => ({ ok: true, mode, apiVersion: 1 }));
  app.post("/api/households", async (r) => {
    z.object({ name: z.string().min(1).max(80) }).parse(r.body);
    if (member(r).household) throw fail(409, "Already a member");
    return store.mutate((s) => {
      const m = {
        id: member(r).id,
        household: crypto.randomUUID(),
        consent: "private" as const,
      };
      s.members.push(m);
      return { id: m.household };
    });
  });
  app.post("/api/households/:id/invitations", async (r) => {
    if ((r.params as any).id !== member(r).household)
      throw fail(403, "Wrong household");
    const b = z.object({ recipient: z.string().min(1).max(200) }).parse(r.body);
    return store.mutate((s) => {
      const invitation = {
        id: crypto.randomUUID(),
        household: member(r).household,
        recipient: b.recipient,
      };
      (s.invitations ??= []).push(invitation);
      return invitation;
    });
  });
  app.post("/api/households/:id/join", async (r) => {
    const b = z
      .object({ invitationId: z.string(), consent: z.literal(true) })
      .parse(r.body);
    return store.mutate((s) => {
      const invitation = s.invitations?.find(
        (i) =>
          i.id === b.invitationId &&
          i.recipient === member(r).id &&
          i.household === (r.params as any).id,
      );
      if (!invitation) throw fail(403, "Invitation missing");
      if (
        s.members.filter((m) => m.household === invitation.household).length >=
        2
      )
        throw fail(409, "Household full");
      const existing = s.members.find((m) => m.id === member(r).id);
      if (existing) {
        existing.household = invitation.household;
        existing.consent = "private";
      } else
        s.members.push({
          id: member(r).id,
          household: invitation.household,
          consent: "private",
        });
      s.invitations = s.invitations!.filter((i) => i.id !== invitation.id);
      audit(s, member(r), "household_joined");
      return { ok: true };
    });
  });
  app.get("/api/notifications", async (r) => ({
    notifications: await store.mutate((s) =>
      planJobs(s).filter((j) => j.recipient === member(r).id),
    ),
  }));
  app.post("/api/digest", async (r) => {
    const mon = month(r.query);
    const state = await store.read();
    return {
      month: mon,
      totalMinor: spending(scoped(state, member(r)), mon),
      benefits: benefitRows(state, member(r), mon + "-01"),
      notice:
        "Observed spending and attested savings only; synthetic in mock mode",
    };
  });
  app.get("/api/me", (r) => ({ member: member(r), mode }));
  app.get("/api/cards", async (r) => ({
    cards: cards(await store.read(), member(r)),
  }));
  app.post("/api/cards", async (r) => {
    const b = z
      .object({
        productId: z.string().min(1),
        displayName: z.string().min(1).max(200),
        relationship: z.enum(["primary", "authorized_user"]),
        primaryId: z.string().optional(),
        anniversary: z.iso.date().optional(),
      })
      .strict()
      .parse(r.body);
    return store.mutate((s) => {
      if (
        b.relationship === "authorized_user" &&
        !cards(s, member(r)).some(
          (c) =>
            c.id === b.primaryId &&
            c.relationship === "primary" &&
            c.productId === b.productId,
        )
      )
        throw fail(400, "Valid primary required");
      const c = { ...b, id: crypto.randomUUID(), owner: member(r).id };
      s.cards.push(c);
      return c;
    });
  });
  app.patch("/api/cards/:id", async (r) => {
    const b = z
      .object({ anniversary: z.iso.date().optional() })
      .strict()
      .parse(r.body);
    return store.mutate((s) => {
      const c = s.cards.find(
        (c) => c.id === (r.params as any).id && c.owner === member(r).id,
      );
      if (!c) throw fail(404, "Card missing");
      Object.assign(c, b);
      return c;
    });
  });
  app.get("/api/transactions", async (r) => {
    const q = z
      .object({
        month: monthSchema.optional(),
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(r.query);
    const txs = scoped(await store.read(), member(r), true).filter(
      (t) => !q.month || t.date.startsWith(q.month),
    );
    return {
      transactions: txs.slice(q.offset, q.offset + q.limit),
      total: txs.length,
    };
  });
  app.get("/api/spending/summary", async (r) => {
    const m = month(r.query);
    const txs = scoped(await store.read(), member(r));
    const categories: Record<string, number> = {};
    for (const t of txs)
      if (!t.pending && t.category !== "transfer" && t.date.startsWith(m))
        categories[t.category] = (categories[t.category] ?? 0) + t.amountMinor;
    return {
      month: m,
      totalMinor: spending(txs, m),
      categories,
      currency: "USD",
    };
  });
  const offers = (s: State, m: Member) =>
    s.offers.map((o) => ({
      ...o,
      ...match(o, scoped(s, m, true)),
      usage: s.confirmations[`${m.id}:${o.id}`]
        ? "confirmed_used"
        : match(o, scoped(s, m, true)).usage,
      availability:
        o.personalEligibility === "available_on_card"
          ? "available_on_card"
          : o.targeted
            ? "targeted_eligibility_unknown"
            : "unknown",
      freshness:
        o.expiresAt < DateTime.now().setZone("America/Los_Angeles").toISODate()!
          ? "expired"
          : "current",
    }));
  app.get("/api/offers", async (r) => {
    const s = await store.read();
    const q = z.object({ merchant: z.string().optional() }).parse(r.query);
    return {
      offers: offers(s, member(r)).filter(
        (o) =>
          !q.merchant ||
          o.merchant.toLowerCase().includes(q.merchant.toLowerCase()),
      ),
    };
  });
  app.get("/api/offers/:id", async (r) => {
    const o = offers(await store.read(), member(r)).find(
      (o) => o.id === (r.params as any).id,
    );
    if (!o) throw fail(404, "Offer missing");
    return o;
  });
  app.patch("/api/offers/:id/confirmation", async (r) => {
    const b = z
      .object({
        confirmed: z.boolean(),
        amountMinor: z.number().int().min(0).max(1000000),
      })
      .parse(r.body);
    return store.mutate((s) => {
      const id = (r.params as any).id;
      if (!s.offers.some((o) => o.id === id)) throw fail(404, "Offer missing");
      const key = `${member(r).id}:${id}`;
      if (b.confirmed)
        s.confirmations[key] = {
          member: member(r).id,
          amountMinor: b.amountMinor,
          at: new Date().toISOString(),
        };
      else delete s.confirmations[key];
      audit(s, member(r), "offer_attestation");
      return { ok: true };
    });
  });
  const benefitRows = (s: State, m: Member, date: string) => {
    const defaults =
      mode === "mock"
        ? [...new Set(s.cards.map((c) => c.productId))].map((productId) =>
            Definition.parse({
              id: productId,
              productId,
              title: "Fictional demo credit",
              allowanceMinor: 1000,
              cycle: "month",
              sharedWithAU: true,
              enrollmentRequired: true,
              verificationStatus: "mock_only",
            }),
          )
        : [];
    const defs = s.definitions ?? defaults;
    const rows = new Map<string, any>();
    for (const c of cards(s, m))
      for (const d of defs.filter((d) => d.productId === c.productId)) {
        const owner = benefitOwner(c, d.sharedWithAU);
        const primary = s.cards.find((x) => x.id === owner)!;
        if (d.cycle === "card_anniversary_year" && !primary.anniversary)
          continue;
        const w = windowFor(date, d.cycle, d.timezone, primary.anniversary);
        const id = d.id + ":" + owner + ":" + w.startsAt;
        const confirmation = s.confirmations[id];
        rows.set(id, {
          id,
          title: d.title,
          ownerCardId: owner,
          owner: primary.owner,
          allowanceMinor: d.allowanceMinor,
          confirmedMinor: confirmation?.amountMinor ?? 0,
          remainingMinor: Math.max(
            0,
            d.allowanceMinor - (confirmation?.amountMinor ?? 0),
          ),
          verificationStatus: d.verificationStatus,
          enrollmentRequired: d.enrollmentRequired,
          ...w,
        });
      }
    return [...rows.values()];
  };
  app.get("/api/benefits", async (r) => ({
    benefits: benefitRows(
      await store.read(),
      member(r),
      month(r.query) + "-01",
    ),
    notice:
      mode === "mock"
        ? "Synthetic amounts, not issuer terms"
        : "No verified benefit definitions yet",
  }));
  app.patch("/api/benefit-definitions/:id", async (r) => {
    if (mode !== "mock") throw fail(403, "Only reviewed definitions permitted");
    const d = Definition.parse({
      ...(r.body as any),
      id: (r.params as any).id,
    });
    windowFor(
      "2026-11-07",
      d.cycle,
      d.timezone,
      d.cycle === "card_anniversary_year" ? "2020-01-01" : undefined,
    );
    return store.mutate((s) => {
      s.definitions ??= [...new Set(s.cards.map((c) => c.productId))].map(
        (productId) =>
          Definition.parse({
            id: productId,
            productId,
            title: "Fictional demo credit",
            allowanceMinor: 1000,
            cycle: "month",
            sharedWithAU: true,
            enrollmentRequired: true,
            verificationStatus: "mock_only",
          }),
      );
      s.definitions = s.definitions.filter((x) => x.id !== d.id);
      s.definitions.push(d);
      audit(s, member(r), "demo_schedule_changed");
      return d;
    });
  });
  app.patch("/api/benefit-periods/:id/confirmation", async (r) => {
    const b = BenefitConfirmation.parse(r.body);
    const date = month(r.query as any) + "-01";
    return store.mutate((s) => {
      const row = benefitRows(s, member(r), date).find(
        (x) => x.id === (r.params as any).id,
      );
      if (!row || row.owner !== member(r).id)
        throw fail(404, "Benefit missing");
      if (b.amountMinor > row.allowanceMinor)
        throw fail(400, "Above allowance");
      if (b.confirmed)
        s.confirmations[row.id] = {
          member: member(r).id,
          amountMinor: b.amountMinor,
          at: new Date().toISOString(),
        };
      else delete s.confirmations[row.id];
      audit(s, member(r), "benefit_attestation");
      return { ok: true };
    });
  });
  app.get("/api/households/:id/dashboard", async (r) => {
    const m = member(r);
    if ((r.params as any).id !== m.household)
      throw fail(403, "Wrong household");
    const s = await store.read();
    const mon = month(r.query);
    return {
      month: mon,
      totalMinor: spending(scoped(s, m), mon),
      confirmedMinor: Object.values(s.confirmations)
        .filter(
          (c) =>
            c.member === m.id &&
            DateTime.fromISO(c.at)
              .setZone("America/Los_Angeles")
              .toFormat("yyyy-MM") === mon,
        )
        .reduce((n, c) => n + c.amountMinor, 0),
      cardCount: cards(s, m).length,
      possiblyUsed: offers(s, m).filter((o) => o.usage === "possibly_used")
        .length,
      mode,
    };
  });
  app.get("/api/sources", async (r) => ({
    sources: (await store.read()).sources.filter(
      (x) => !x.household || x.household === member(r).household,
    ),
  }));
  app.post("/api/sources", async (r) => {
    const b = z.object({ url: z.url() }).strict().parse(r.body);
    safeURL(b.url);
    return store.mutate((s) => {
      const source = {
        id: crypto.randomUUID(),
        url: b.url,
        kind: "user_supplied",
        allowed: false,
        household: member(r).household,
      };
      s.sources.push(source);
      return source;
    });
  });
  app.post("/api/sources/:id/check", async (r) => {
    const source = (await store.read()).sources.find(
      (s) =>
        s.id === (r.params as any).id &&
        (!s.household || s.household === member(r).household),
    );
    if (!source) throw fail(404, "Source missing");
    if (!source.allowed)
      return {
        status: "unavailable",
        reason: "Source access policy has not been approved",
      };
    try {
      const result = await checkSource(source.url);
      await store.mutate((s) =>
        Object.assign(
          s.sources.find((x) => x.id === source.id)!,
          {
            lastChecked: result.fetchedAt,
            hash: result.hash,
            excerpt: result.excerpt,
            error: undefined,
          },
        ),
      );
      return result;
    } catch {
      await store.mutate((s) =>
        Object.assign(
          s.sources.find((x) => x.id === source.id)!,
          {
            lastChecked: new Date().toISOString(),
            error: "Public fetch unavailable; no offer inferred",
          },
        ),
      );
      return { status: "unavailable" };
    }
  });
  app.get("/api/discovery/search", async (r) => ({
    results: await searchPublic(
      z
        .string()
        .min(2)
        .max(100)
        .parse((r.query as any).q),
    ),
  }));
  app.patch("/api/me/consent", async (r) => {
    const b = z
      .object({ consent: z.enum(["private", "summary", "detail"]) })
      .parse(r.body);
    return store.mutate((s) => {
      s.members.find((m) => m.id === member(r).id)!.consent = b.consent;
      audit(s, member(r), "consent_changed");
      return b;
    });
  });
  app.get("/api/recommendations", async (r) => {
    const b = z
      .object({
        amountMinor: z.coerce.number().int().min(0).max(100000000),
        pointsPerDollar: z.coerce.number().int().min(0).max(20).default(1),
        pointValueMinor: z.coerce.number().int().min(0).max(10).default(1),
      })
      .parse(r.query);
    return {
      assumptions:
        "User-configured flat earning rate; verify issuer categories, caps and activation. No guaranteed redemption value.",
      cards: cards(await store.read(), member(r))
        .filter((c) => c.owner === member(r).id)
        .map((c) => ({
          cardId: c.id,
          expectedMinor: Math.floor(
            (b.amountMinor * b.pointsPerDollar * b.pointValueMinor) / 100,
          ),
        })),
    };
  });
  const sync = async (id: string, owner?: string) =>
    store.mutate(async (s) => {
      const item = s.items[id];
      if (!item || (owner && item.owner !== owner))
        throw fail(404, "Item missing");
      const result = await syncPages(
        unseal(item.token),
        item.owner,
        id,
        s.transactions,
        item.cursor,
        undefined,
        s.accountMaps,
      );
      s.transactions = result.transactions;
      item.cursor = result.cursor;
      return { ok: true };
    });
  app.get("/api/plaid/items", async (r) => ({
    items: Object.entries((await store.read()).items)
      .filter(([, i]) => i.owner === member(r).id)
      .map(([id]) => ({ id })),
  }));
  app.get("/api/plaid/:id/accounts", async (r) => {
    const item = (await store.read()).items[(r.params as any).id];
    if (!item || item.owner !== member(r).id) throw fail(404, "Item missing");
    if (mode === "mock")
      return {
        accounts: [
          {
            id: "mock-account",
            name: "Synthetic account",
            productMappingRequired: true,
          },
        ],
      };
    return {
      accounts: (
        await plaid("accounts/get", { access_token: unseal(item.token) })
      ).accounts.map((a: any) => ({
        id: a.account_id,
        name: a.name,
        productMappingRequired: true,
      })),
    };
  });
  app.post("/api/plaid/:id/mapping", async (r) => {
    const b = z
      .object({
        accountId: z.string(),
        cardId: z.string(),
        confirmed: z.literal(true),
      })
      .parse(r.body);
    return store.mutate(async (s) => {
      const id = (r.params as any).id;
      const item = s.items[id];
      if (
        !item ||
        item.owner !== member(r).id ||
        !s.cards.some((c) => c.id === b.cardId && c.owner === member(r).id)
      )
        throw fail(404, "Item or card missing");
      const accounts =
        mode === "mock"
          ? [{ account_id: "mock-account" }]
          : (await plaid("accounts/get", { access_token: unseal(item.token) }))
              .accounts;
      if (!accounts.some((a: any) => a.account_id === b.accountId))
        throw fail(400, "Account missing");
      const target = s.cards.find((c) => c.id === b.cardId)!;
      const canonical = target.primaryId ?? target.id;
      for (const [key, mapping] of Object.entries(s.accountMaps ?? {})) {
        const other = s.cards.find((c) => c.id === mapping.cardId);
        if (
          key !== id + ":" + b.accountId &&
          other &&
          (other.primaryId ?? other.id) === canonical
        )
          throw fail(
            409,
            "Shared account already mapped; use a single import owner",
          );
      }
      (s.accountMaps ??= {})[id + ":" + b.accountId] = {
        itemId: id,
        owner: member(r).id,
        cardId: b.cardId,
      };
      return { ok: true };
    });
  });
  app.post("/api/plaid/:id/reconnect", async (r) => {
    const item = (await store.read()).items[(r.params as any).id];
    if (!item || item.owner !== member(r).id) throw fail(404, "Item missing");
    return mode === "mock"
      ? { link_token: "mock-update", mode }
      : plaid("link/token/create", {
          user: { client_user_id: member(r).id },
          client_name: "CardPilot",
          access_token: unseal(item.token),
          country_codes: ["US"],
          language: "en",
          redirect_uri: process.env.PLAID_REDIRECT_URI,
        });
  });
  app.post("/api/plaid/link-token", async (r) =>
    mode === "mock"
      ? { link_token: "mock-link-token", mode }
      : plaid("link/token/create", {
          user: { client_user_id: member(r).id },
          client_name: "CardPilot",
          products: ["transactions"],
          country_codes: ["US"],
          language: "en",
          redirect_uri: process.env.PLAID_REDIRECT_URI,
          webhook: process.env.PLAID_WEBHOOK_URL,
        }),
  );
  app.post("/api/plaid/exchange", async (r) => {
    const b = z
      .object({
        public_token: z.string().min(1).max(1000),
        consent: z.literal(true),
      })
      .parse(r.body);
    if (mode === "mock") {
      const id = "mock-item-" + member(r).id;
      await store.mutate((s) => {
        s.items[id] = { owner: member(r).id, token: "mock-only" };
      });
      return { itemId: id, mode };
    }
    const result = await plaid("item/public_token/exchange", b);
    await store.mutate((s) => {
      if (
        s.items[result.item_id] &&
        s.items[result.item_id].owner !== member(r).id
      )
        throw fail(403, "Item already owned");
      s.items[result.item_id] = {
        owner: member(r).id,
        token: seal(result.access_token),
      };
    });
    return {
      itemId: result.item_id,
      accounts: (
        await plaid("accounts/get", { access_token: result.access_token })
      ).accounts.map((a: any) => ({
        id: a.account_id,
        name: a.name,
        productMappingRequired: true,
      })),
    };
  });
  app.post("/api/plaid/:id/sync", async (r) => {
    const id = (r.params as any).id;
    const item = (await store.read()).items[id];
    if (!item || item.owner !== member(r).id) throw fail(404, "Item missing");
    return mode === "mock" ? { ok: true, mode } : sync(id, member(r).id);
  });
  app.delete("/api/plaid/:id", async (r) =>
    store.mutate(async (s) => {
      const id = (r.params as any).id;
      const item = s.items[id];
      if (!item || item.owner !== member(r).id) throw fail(404, "Item missing");
      if (mode !== "mock")
        await plaid("item/remove", { access_token: unseal(item.token) });
      delete s.items[id];
      for (const [key, map] of Object.entries(s.accountMaps ?? {}))
        if (map.itemId === id) delete s.accountMaps![key];
      s.transactions = s.transactions.filter((t) => !t.id.startsWith(`${id}:`));
      audit(s, member(r), "plaid_disconnected");
      return { ok: true };
    }),
  );
  app.post("/api/plaid/webhook", async (r) => {
    if (mode === "mock") throw fail(403, "Webhook disabled in mock");
    try {
      await verifyWebhook(
        z.string().parse(r.headers["plaid-verification"]),
        (r as any).rawBody,
      );
    } catch {
      throw fail(401, "Invalid signature");
    }
    const b = z
      .object({ item_id: z.string(), webhook_code: z.string() })
      .parse(r.body);
    if (b.webhook_code === "SYNC_UPDATES_AVAILABLE") await sync(b.item_id);
    return { ok: true };
  });
  app.delete("/api/me/data", async (r) =>
    store.mutate(async (s) => {
      const m = member(r);
      for (const [id, item] of Object.entries(s.items))
        if (item.owner === m.id) {
          if (mode !== "mock")
            await plaid("item/remove", { access_token: unseal(item.token) });
          delete s.items[id];
        }
      s.transactions = s.transactions.filter((t) => t.member !== m.id);
      s.cards = s.cards.filter((c) => c.owner !== m.id);
      for (const [k, v] of Object.entries(s.confirmations))
        if (v.member === m.id) delete s.confirmations[k];
      s.members = s.members.filter((x) => x.id !== m.id);
      s.jobs = s.jobs?.filter((j) => j.recipient !== m.id);
      s.invitations = s.invitations?.filter((i) => i.recipient !== m.id);
      for (const [key, map] of Object.entries(s.accountMaps ?? {}))
        if (map.owner === m.id) delete s.accountMaps![key];
      audit(s, m, "member_erased");
      return { ok: true };
    }),
  );
  return app;
}
