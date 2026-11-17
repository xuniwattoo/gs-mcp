import { describe, expect, it } from "vitest";
import { canonicalizeClientIp } from "../src/lib/ip.js";

describe("canonicalizeClientIp", () => {
  it("keeps IPv4 as-is", () => {
    expect(canonicalizeClientIp(" 203.0.113.50 ")).toBe("203.0.113.50");
  });
  it("maps IPv4-mapped IPv6 to IPv4", () => {
    expect(canonicalizeClientIp("::ffff:192.0.2.10")).toBe("192.0.2.10");
  });
  it("folds IPv6 (full and compressed) to a /64 prefix", () => {
    expect(canonicalizeClientIp("2001:db8:abcd:1234:5678:9abc:def0:1")).toBe("2001:db8:abcd:1234::/64");
    expect(canonicalizeClientIp("2001:DB8:ABCD:1234::5678")).toBe("2001:db8:abcd:1234::/64");
    expect(canonicalizeClientIp("2001:db8:abcd:1234:1:2:3:4")).toBe(canonicalizeClientIp("2001:db8:abcd:1234:aaaa:bbbb:cccc:dddd"));
  });
  it("strips brackets and zone ids", () => {
    expect(canonicalizeClientIp("[2001:db8:1:2:3:4:5:6%eth0]")).toBe("2001:db8:1:2::/64");
  });
  it("falls back safely", () => {
    expect(canonicalizeClientIp("")).toBe("unknown");
    expect(canonicalizeClientIp("not-an-ip")).toBe("not-an-ip");
  });
});
