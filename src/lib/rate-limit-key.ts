/**
 * The rate-limit bucket for an IP. IPv4 stays whole; IPv6 is cut to its /64,
 * because one home or phone is usually handed a whole /64 and can use a fresh
 * address in it for every request, which would give it a new bucket each time.
 */
export function rateLimitKey(ip: string): string {
  if (!ip.includes(":")) return ip;

  // An IPv4 address written as IPv6 (::ffff:203.0.113.7) is still one host.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1]!;

  const [head = "", tail] = ip.toLowerCase().split("%")[0]!.split("::");
  const front = head ? head.split(":") : [];
  const back = tail === undefined ? [] : tail ? tail.split(":") : [];
  const groups = tail === undefined ? front : [...front, ...Array(8 - front.length - back.length).fill("0"), ...back];

  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, "") || "0")
    .join(":")}::/64`;
}
