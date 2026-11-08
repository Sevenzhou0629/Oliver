import { seal, unseal } from "./plaid.js";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import type { Definition } from "./contracts.js";
import type { Job } from "./jobs.js";
import { Offer, Transaction, type Card } from "./domain.js";
export interface Member {
  id: string;
  household: string;
  consent: "private" | "summary" | "detail";
}
export interface State {
  snapshots?: ({ sourceId: string } & Record<string, unknown>)[];
  definitions?: Definition[];
  jobs?: Job[];
  invitations?: { id: string; household: string; recipient: string }[];
  accountMaps?: Record<
    string,
    { itemId: string; owner: string; cardId: string }
  >;
  members: Member[];
  cards: Card[];
  transactions: Transaction[];
  offers: Offer[];
  sources: {
    id: string;
    url: string;
    kind: string;
    allowed: boolean;
    household?: string;
    lastChecked?: string;
    error?: string;
    hash?: string;
    excerpt?: string;
  }[];
  confirmations: Record<
    string,
    { member: string; amountMinor: number; at: string }
  >;
  items: Record<string, { owner: string; token: string; cursor?: string }>;
  audit: { actor: string; action: string; at: string }[];
}
export async function seed(): Promise<State> {
  const fixture = async (name: string) =>
    JSON.parse(
      await readFile(
        new URL(`../../fixtures/${name}.json`, import.meta.url),
        "utf8",
      ),
    );
  const catalog = await fixture("card-catalog");
  const cards: Card[] = [];
  for (const p of catalog.cards) {
    for (let i = 0; i < p.primaryCount; i++)
      cards.push({
        id: `${p.productId}-${i}`,
        productId: p.productId,
        displayName: p.displayName,
        owner: i % 2 ? "person_b" : "person_a",
        relationship: "primary",
      });
    for (let i = 0; i < p.authorizedUserCount; i++)
      cards.push({
        id: `${p.productId}-au-${i}`,
        productId: p.productId,
        displayName: p.displayName,
        owner: "person_b",
        relationship: "authorized_user",
        primaryId: `${p.productId}-0`,
      });
  }
  return {
    members: [
      { id: "person_a", household: "demo", consent: "detail" },
      { id: "person_b", household: "demo", consent: "detail" },
    ],
    cards,
    transactions: (await fixture("demo-transactions")).transactions.map(
      (t: unknown) => Transaction.parse(t),
    ),
    offers: (await fixture("demo-offers")).offers.map((o: unknown) =>
      Offer.parse(o),
    ),
    sources: [
      {
        id: "amex",
        url: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
        kind: "issuer_official",
        allowed: false,
      },
      {
        id: "backup",
        url: "https://www.uscreditcardguide.com/",
        kind: "backup_report",
        allowed: false,
      },
    ],
    confirmations: {},
    items: {},
    audit: [],
  };
}
// Each mutation holds a PostgreSQL row lock. Cursor + transaction changes commit together.
// Provider household state is AES-GCM envelope-encrypted; Plaid tokens are also separately encrypted.
export class Store {
  private encode(s: State) {
    return process.env.TOKEN_ENCRYPTION_KEY
      ? { encrypted: seal(JSON.stringify(s)) }
      : s;
  }
  private decode(s: any): State {
    return s.encrypted ? JSON.parse(unseal(s.encrypted)) : s;
  }
  pool?: Pool;
  state?: State;
  constructor(url?: string) {
    if (url) this.pool = new Pool({ connectionString: url });
  }
  async init() {
    if (this.pool) {
      await this.pool.query(
        "INSERT INTO app_state(id,payload) VALUES (1,$1) ON CONFLICT DO NOTHING",
        [this.encode(await seed())],
      );
    } else this.state = await seed();
  }
  async read(): Promise<State> {
    return this.pool
      ? this.decode(
          (await this.pool.query("SELECT payload FROM app_state WHERE id=1"))
            .rows[0].payload,
        )
      : structuredClone(this.state!);
  }
  private tail: Promise<unknown> = Promise.resolve();
  async mutate<T>(fn: (s: State) => Promise<T> | T): Promise<T> {
    const run = async () => {
      if (!this.pool) {
        const copy = structuredClone(this.state!);
        const result = await fn(copy);
        this.state = copy;
        return result;
      }
      const c = await this.pool.connect();
      try {
        await c.query("BEGIN");
        const s = this.decode(
          (await c.query("SELECT payload FROM app_state WHERE id=1 FOR UPDATE"))
            .rows[0].payload,
        );
        const result = await fn(s);
        await c.query(
          "UPDATE app_state SET payload=$1,version=version+1 WHERE id=1",
          [this.encode(s)],
        );
        await c.query("COMMIT");
        return result;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    };
    const result = this.tail.then(run);
    this.tail = result.catch(() => {});
    return result;
  }
  async close() {
    await this.pool?.end();
  }
}
