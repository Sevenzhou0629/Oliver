import { Store } from "./store.js";
import { safeURL } from "./discovery.js";
// Operator-only CLI, deliberately not an approval-by-user-supplied-URL API.
if (process.argv[3] !== "--access-policy-reviewed" || !process.env.DATABASE_URL)
  throw Error(
    "Usage: DATABASE_URL=... npm run source:approve -- <source-id> --access-policy-reviewed",
  );
const store = new Store(process.env.DATABASE_URL);
await store.init();
try {
  await store.mutate((s) => {
    const source = s.sources.find((x) => x.id === process.argv[2]);
    if (!source) throw Error("Source missing");
    safeURL(source.url);
    source.allowed = true;
  });
} finally {
  await store.close();
}
