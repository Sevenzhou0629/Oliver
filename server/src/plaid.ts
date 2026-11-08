import { Configuration, PlaidApi, PlaidEnvironments } from "plaid/legacy";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import { decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { z } from "zod";
import { Transaction, reconcile } from "./domain.js";
export function seal(
  value: string,
  key = process.env.TOKEN_ENCRYPTION_KEY ?? "",
) {
  if (!/^[a-f0-9]{64}$/i.test(key)) throw Error("Encryption key required");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  return Buffer.concat([
    iv,
    c.update(value),
    c.final(),
    c.getAuthTag(),
  ]).toString("base64");
}
export function unseal(
  value: string,
  key = process.env.TOKEN_ENCRYPTION_KEY ?? "",
) {
  const b = Buffer.from(value, "base64");
  const c = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    b.subarray(0, 12),
  );
  c.setAuthTag(b.subarray(-16));
  return Buffer.concat([c.update(b.subarray(12, -16)), c.final()]).toString();
}
export async function plaid(
  path: string,
  body: Record<string, unknown>,
): Promise<any> {
  const api = new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments.sandbox,
      baseOptions: {
        timeout: 15000,
        headers: {
          "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
          "PLAID-SECRET": process.env.PLAID_SECRET,
        },
      },
    }),
  );
  const methods: Record<string, string> = {
    "link/token/create": "linkTokenCreate",
    "item/public_token/exchange": "itemPublicTokenExchange",
    "accounts/get": "accountsGet",
    "transactions/sync": "transactionsSync",
    "item/remove": "itemRemove",
    "webhook_verification_key/get": "webhookVerificationKeyGet",
  };
  const method = methods[path];
  if (!method) throw Error("Unsupported Plaid operation");
  try {
    return (await (api as any)[method](body)).data;
  } catch (e) {
    throw Object.assign(Error("Plaid request failed"), {
      code: (e as any).response?.data?.error_code,
    });
  }
}
const Page = z.object({
  added: z.array(z.any()),
  modified: z.array(z.any()),
  removed: z.array(z.object({ transaction_id: z.string() })),
  next_cursor: z.string(),
  has_more: z.boolean(),
});
// Amount from provider decimal dollars is converted through decimal string parsing.
export function minor(value: number) {
  const s = value.toFixed(2);
  const negative = s.startsWith("-");
  const [a, b] = s.replace("-", "").split(".");
  const n = Number(a) * 100 + Number(b);
  if (!Number.isSafeInteger(n)) throw Error("Invalid amount");
  return negative ? -n : n;
}
export async function syncPages(
  token: string,
  owner: string,
  itemId: string,
  existing: Transaction[],
  cursor?: string,
  call = plaid,
  maps?: Record<string, { cardId: string }>,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let current = cursor;
    let txs = existing;
    try {
      for (let page = 0; page < 100; page++) {
        const p = Page.parse(
          await call("transactions/sync", {
            access_token: token,
            cursor: current,
          }),
        );
        const convert = (t: any) =>
          Transaction.parse({
            id: `${itemId}:${t.transaction_id}`,
            member: owner,
            merchant: t.merchant_name ?? t.name,
            amountMinor: minor(t.amount),
            currency: t.iso_currency_code,
            date: t.date,
            pending: t.pending,
            pendingTransactionId: t.pending_transaction_id
              ? `${itemId}:${t.pending_transaction_id}`
              : undefined,
            cardId: maps?.[itemId + ":" + t.account_id]?.cardId,
            category: t.personal_finance_category?.primary?.includes("TRANSFER")
              ? "transfer"
              : (t.personal_finance_category?.primary?.toLowerCase() ??
                "other"),
          });
        txs = reconcile(
          txs,
          [...p.added, ...p.modified].map(convert),
          p.removed.map((t) => `${itemId}:${t.transaction_id}`),
        );
        current = p.next_cursor;
        if (!p.has_more) return { transactions: txs, cursor: current };
      }
      throw Error("Pagination limit");
    } catch (e) {
      if (
        (e as any).code !== "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" ||
        attempt === 2
      )
        throw e;
    }
  }
  throw Error("Sync retries exhausted");
}
export async function verifyWebhook(jwt: string, raw: Buffer, call = plaid) {
  const h = decodeProtectedHeader(jwt);
  if (h.alg !== "ES256" || !h.kid) throw Error("Invalid webhook header");
  const { key } = await call("webhook_verification_key/get", { key_id: h.kid });
  if (key.expired_at) throw Error("Expired key");
  const publicKey = await importJWK(key, "ES256");
  const { payload } = await jwtVerify(jwt, publicKey, {
    algorithms: ["ES256"],
    maxTokenAge: "5m",
    clockTolerance: 5,
  });
  if (
    payload.request_body_sha256 !==
    createHash("sha256").update(raw).digest("hex")
  )
    throw Error("Invalid webhook body");
}
