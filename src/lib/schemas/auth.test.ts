import { describe, expect, it } from "vitest";

import { EmailSchema, LoginFormSchema, PasswordSchema, SignupFormSchema } from "./auth";

describe("EmailSchema", () => {
  it("normalises email to lowercase + trimmed", () => {
    expect(EmailSchema.parse("  Hi@EXAMPLE.com ")).toBe("hi@example.com");
  });

  it("rejects invalid email", () => {
    expect(EmailSchema.safeParse("not-an-email").success).toBe(false);
  });
});

describe("PasswordSchema", () => {
  it("accepts a strong password", () => {
    expect(PasswordSchema.safeParse("Goodpass1").success).toBe(true);
  });

  it("rejects too short", () => {
    expect(PasswordSchema.safeParse("Aa1").success).toBe(false);
  });

  it("rejects missing uppercase / lowercase / digit", () => {
    expect(PasswordSchema.safeParse("alllowercase1").success).toBe(false);
    expect(PasswordSchema.safeParse("ALLUPPERCASE1").success).toBe(false);
    expect(PasswordSchema.safeParse("NoDigitsHere").success).toBe(false);
  });
});

describe("LoginFormSchema", () => {
  it("accepts a valid form", () => {
    expect(LoginFormSchema.safeParse({ email: "a@b.com", password: "Goodpass1" }).success).toBe(true);
  });
});

describe("SignupFormSchema", () => {
  it("rejects mismatched passwords", () => {
    const result = SignupFormSchema.safeParse({
      name: "Alice",
      email: "a@b.com",
      password: "Goodpass1",
      confirmPassword: "Goodpass2",
    });
    expect(result.success).toBe(false);
  });

  it("accepts matching passwords", () => {
    const result = SignupFormSchema.safeParse({
      name: "Alice",
      email: "a@b.com",
      password: "Goodpass1",
      confirmPassword: "Goodpass1",
    });
    expect(result.success).toBe(true);
  });
});
