import { describe, expect, it } from "vitest";

import { rateLimitKey } from "./rate-limit-key";

describe("rateLimitKey", () => {
  it("keeps an IPv4 address whole", () => {
    expect(rateLimitKey("203.0.113.7")).toBe("203.0.113.7");
  });

  it("puts every address in one IPv6 /64 in the same bucket", () => {
    const a = rateLimitKey("2001:db8:85a3:12:1111:2222:3333:4444");
    const b = rateLimitKey("2001:0db8:85a3:0012:aaaa:bbbb:cccc:dddd");
    expect(a).toBe("2001:db8:85a3:12::/64");
    expect(b).toBe(a);
  });

  it("expands :: before cutting, so a short form lands in the right /64", () => {
    expect(rateLimitKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(rateLimitKey("::1")).toBe("0:0:0:0::/64");
  });

  it("keeps different /64s apart", () => {
    expect(rateLimitKey("2001:db8:0:1::5")).not.toBe(rateLimitKey("2001:db8:0:2::5"));
  });

  it("treats an IPv4-mapped address as the IPv4 host", () => {
    expect(rateLimitKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });
});
