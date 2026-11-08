import { buildApp } from "./app.js";
import { Store } from "./store.js";
import { runJobs } from "./jobs.js";
const store = new Store(process.env.DATABASE_URL);
const app = await buildApp(store);
const tick = () =>
  runJobs(store).catch(() => console.error("Background check unavailable"));
await tick();
const timer = setInterval(tick, 60_000);
timer.unref();
app.addHook("onClose", async () => {
  clearInterval(timer);
});
await app.listen({ port: Number(process.env.PORT ?? 3000), host: "127.0.0.1" });
console.log(
  "CardPilot API listening on http://127.0.0.1:3000 (see README for demo authentication)",
);
