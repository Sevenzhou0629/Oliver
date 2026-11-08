import { DateTime } from "luxon";
import { type State } from "./store.js";
export interface Job {
  key: string;
  recipient: string;
  kind:
    | "daily_source_check"
    | "weekly_benefit_review"
    | "monthly_digest"
    | "offer_expiry";
  target?: string;
  at: string;
  status: "pending" | "delivered";
}
// Stored in the same transaction as schedule creation; keys deduplicate repeat runs.
export function planJobs(s: State, now = new Date()) {
  const jobs = (s.jobs ??= []);
  const enqueue = (job: Job) => {
    if (!jobs.some((j) => j.key === job.key)) jobs.push(job);
  };
  for (const member of s.members) {
    const t = DateTime.fromJSDate(now, { zone: "America/Los_Angeles" });
    const base = {
      recipient: member.id,
      at: now.toISOString(),
      status: "pending" as const,
    };
    enqueue({
      ...base,
      key: `${member.id}:daily:${t.toISODate()}`,
      kind: "daily_source_check",
    });
    enqueue({
      ...base,
      key: `${member.id}:weekly:${t.weekYear}-${t.weekNumber}`,
      kind: "weekly_benefit_review",
    });
    enqueue({
      ...base,
      key: `${member.id}:monthly:${t.toFormat("yyyy-MM")}`,
      kind: "monthly_digest",
    });
    for (const offer of s.offers) {
      const expiry = DateTime.fromISO(offer.expiresAt, {
        zone: t.zoneName!,
      }).endOf("day");
      const days = expiry.diff(t, "days").days;
      if (days >= 0 && days <= 7)
        enqueue({
          ...base,
          key: `${member.id}:expiry:${offer.id}:${offer.expiresAt}`,
          kind: "offer_expiry",
          target: offer.id,
        });
    }
  }
  return jobs;
}

export async function runJobs(
  store: import("./store.js").Store,
  now = new Date(),
) {
  await store.mutate(async (s) => {
    planJobs(s, now);
    for (const job of s.jobs!.filter((j) => j.status === "pending")) {
      const member = s.members.find((m) => m.id === job.recipient);
      if (!member) {
        job.status = "delivered";
        continue;
      }
      if (job.kind === "daily_source_check") {
        const { checkSource } = await import("./discovery.js");
        for (const source of s.sources.filter(
          (source) =>
            source.allowed &&
            (!source.household || source.household === member.household),
        )) {
          if (
            source.lastChecked &&
            now.getTime() - Date.parse(source.lastChecked) < 86400000
          )
            continue;
          try {
            const snapshot = await checkSource(source.url);
            source.hash = snapshot.hash;
            source.excerpt = snapshot.excerpt;
            source.lastChecked = snapshot.fetchedAt;
            source.error = undefined;
            (s.snapshots ??= []).push({ sourceId: source.id, ...snapshot });
          } catch {
            source.error = "Public fetch unavailable; no offer inferred";
            source.lastChecked = now.toISOString();
          }
        }
      }
      // Weekly review requests never auto-verify issuer benefits. Delivery is a local inbox.
      job.status = "delivered";
    }
  });
}
