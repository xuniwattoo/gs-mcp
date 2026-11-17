import { describe, expect, it } from "vitest";
import { cleanText, isValidEmail, isValidHttpUrl, normalizeEmail, stripControls, validateCountry, validateEmail, validateHttpUrls, validateName, validatePhone } from "../src/lib/validate.js";

describe("sanitize + validate lead fields", () => {
  it("strips control characters", () => {
    expect(stripControls("A\u0000B\nC")).toBe("ABC");
    expect(cleanText("  hello\u0007  ", 4)).toBe("hell");
  });

  it("accepts normal emails and normalizes case/space", () => {
    expect(isValidEmail("  User+tag@Example.COM ")).toBe(true);
    expect(normalizeEmail("  User+tag@Example.COM ")).toBe("user+tag@example.com");
    expect(validateEmail("  User@Example.com ")).toBe("user@example.com");
  });

  it("rejects bad emails", () => {
    for (const e of ["", "not-an-email", "a@b", "foo@", "@bar.com", "a b@c.com", "x@y"]) {
      expect(isValidEmail(e), e).toBe(false);
      expect(validateEmail(e)).toMatchObject({ error: expect.stringMatching(/valid email/i) });
    }
  });

  it("only allows http(s) product URLs and caps the count", () => {
    expect(isValidHttpUrl("https://www.amazon.com/dp/B000TEST")).toBe(true);
    expect(isValidHttpUrl("http://example.com/x")).toBe(true);
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isValidHttpUrl("ftp://files.example.com/a")).toBe(false);
    expect(isValidHttpUrl("data:text/html,hi")).toBe(false);
    expect(isValidHttpUrl("not a url")).toBe(false);
    const ok = validateHttpUrls(["https://www.nike.com/t/shoe", "http://www.example.com/p/1"]);
    expect(ok).toEqual(["https://www.nike.com/t/shoe", "http://www.example.com/p/1"]);
    expect(validateHttpUrls(["javascript:alert(1)"])).toMatchObject({ error: expect.stringMatching(/http or https/i) });
    expect(validateHttpUrls(Array.from({ length: 21 }, (_, i) => `https://www.example.com/${i}`), 20)).toMatchObject({ error: expect.stringMatching(/at most 20/i) });
  });

  it("requires a destination GS ships to", () => {
    expect(validateCountry(" Angola ")).toEqual({ code: "AO", name: "Angola" });
    expect(validateCountry("uk")).toEqual({ code: "GB", name: expect.any(String) });
    expect(validateCountry("Narnia")).toMatchObject({ error: expect.stringMatching(/Unknown or unsupported/i) });
  });

  it("enforces name and phone length after stripping controls", () => {
    expect(validateName("A\u0000B")).toBe("AB");
    expect(validateName("A")).toMatchObject({ error: expect.stringMatching(/2–120/) });
    expect(validateName("x".repeat(121))).toMatchObject({ error: expect.stringMatching(/2–120/) });
    expect(validatePhone(undefined)).toBeUndefined();
    expect(validatePhone("\u0007+13025550123")).toBe("+13025550123");
    expect(validatePhone("123")).toMatchObject({ error: expect.stringMatching(/Phone/) });
  });
});
