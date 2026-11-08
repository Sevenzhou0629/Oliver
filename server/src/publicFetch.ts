import { lookup } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch } from "undici";
export function publicIP(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  // Use IPv4 only in this restricted public collector; no mapped IPv6 bypasses.
  return false;
}
const dispatcher = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      lookup(hostname, { family: 4, all: true }, (error, addresses) => {
        if (error) return callback(error, [], 4);
        if (!addresses.length || addresses.some((a) => !publicIP(a.address)))
          return callback(Error("Private DNS destination blocked"), [], 4);
        // Pin the checked address directly into the actual connection lookup.
        if (options.all) callback(null, addresses as any);
        else callback(null, addresses[0].address, 4);
      });
    },
  },
});
export function publicFetch(url: URL) {
  return fetch(url, {
    dispatcher,
    redirect: "error",
    headers: { "User-Agent": "CardPilotResearch/0.1" },
    signal: AbortSignal.timeout(10000),
  });
}
