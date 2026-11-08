import { DateTime } from "luxon";
import { z } from "zod";
export const Transaction = z.object({
  id: z.string(),
  member: z.string(),
  merchant: z.string(),
  amountMinor: z.number().int().safe(),
  currency: z.literal("USD"),
  date: z.iso.date(),
  pending: z.boolean(),
  category: z.string(),
  pendingTransactionId: z.string().optional(),
  cardId: z.string().optional(),
});
export type Transaction = z.infer<typeof Transaction>;
export const Offer = z.object({
  id: z.string(),
  merchant: z.string(),
  title: z.string(),
  minimumSpendMinor: z.number().int().nonnegative().optional(),
  rewardMinor: z.number().int().nonnegative().optional(),
  rewardRatePercent: z.number().nonnegative().optional(),
  rewardCapMinor: z.number().int().optional(),
  expiresAt: z.iso.date(),
  startsAt: z.iso.date().optional(),
  sourceUrl: z.url(),
  sourceKind: z.enum([
    "demo",
    "issuer_official",
    "partner_official",
    "backup_report",
  ]),
  verificationStatus: z.enum([
    "mock_only",
    "official_verified",
    "reported_public",
    "stale",
  ]),
  targeted: z.boolean(),
  personalEligibility: z.enum(["unknown", "available_on_card"]),
  enrollmentRequired: z.boolean(),
  cardId: z.string().optional(),
  multipleTransactionsAllowed: z.boolean().default(false),
});
export type Offer = z.infer<typeof Offer>;
export type Cycle =
  "month" | "quarter" | "half_year" | "calendar_year" | "card_anniversary_year";
export function windowFor(
  date: string,
  cycle: Cycle,
  zone = "America/Los_Angeles",
  anniversary?: string,
) {
  const now = DateTime.fromISO(date, { zone });
  if (!now.isValid) throw Error("Invalid date or timezone");
  let start = now.startOf("month");
  let months = 1;
  if (cycle === "quarter") {
    start = start.set({ month: Math.floor((now.month - 1) / 3) * 3 + 1 });
    months = 3;
  }
  if (cycle === "half_year") {
    start = start.set({ month: now.month <= 6 ? 1 : 7 });
    months = 6;
  }
  if (cycle === "calendar_year") {
    start = now.startOf("year");
    months = 12;
  }
  if (cycle === "card_anniversary_year") {
    if (!anniversary) throw Error("Anniversary required");
    const origin = DateTime.fromISO(anniversary, { zone });
    if (!origin.isValid || now < origin) throw Error("Invalid anniversary");
    const at = (year: number) =>
      origin
        .set({ year, day: 1 })
        .set({
          day: Math.min(origin.day, origin.set({ year, day: 1 }).daysInMonth!),
        })
        .startOf("day");
    start = at(now.year);
    if (start > now) start = at(now.year - 1);
    return { startsAt: start.toISO()!, endsAt: at(start.year + 1).toISO()! };
  }
  return { startsAt: start.toISO()!, endsAt: start.plus({ months }).toISO()! };
}
export interface Card {
  id: string;
  productId: string;
  displayName: string;
  owner: string;
  relationship: "primary" | "authorized_user";
  primaryId?: string;
  anniversary?: string;
}
export function benefitOwner(card: Card, shared: boolean) {
  if (shared && card.relationship === "authorized_user") {
    if (!card.primaryId) throw Error("AU primary missing");
    return card.primaryId;
  }
  return card.id;
}
export function reconcile(
  existing: Transaction[],
  added: Transaction[],
  removed: string[] = [],
) {
  const map = new Map(existing.map((t) => [t.id, t]));
  for (const id of removed) map.delete(id);
  for (const tx of added) {
    Transaction.parse(tx);
    if (tx.pendingTransactionId) map.delete(tx.pendingTransactionId);
    map.set(tx.id, tx);
  }
  return [...map.values()];
}
export function spending(txs: Transaction[], month: string) {
  return txs
    .filter(
      (t) =>
        !t.pending && t.category !== "transfer" && t.date.startsWith(month),
    )
    .reduce((n, t) => n + t.amountMinor, 0);
}
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function match(offer: Offer, txs: Transaction[]) {
  const eligible = txs.filter(
    (t) =>
      !t.pending &&
      t.amountMinor > 0 &&
      t.category !== "transfer" &&
      normalize(t.merchant) === normalize(offer.merchant) &&
      t.date <= offer.expiresAt &&
      (!offer.startsAt || t.date >= offer.startsAt) &&
      (!offer.cardId || t.cardId === offer.cardId),
  );
  const amount = offer.multipleTransactionsAllowed
    ? eligible.reduce((n, t) => n + t.amountMinor, 0)
    : Math.max(0, ...eligible.map((t) => t.amountMinor));
  return {
    usage:
      eligible.length && amount >= (offer.minimumSpendMinor ?? 0)
        ? "possibly_used"
        : "unused",
    transactionIds: eligible.map((t) => t.id),
    reason:
      "Merchant/date/amount candidate only; enrollment and redemption require evidence",
  };
}
