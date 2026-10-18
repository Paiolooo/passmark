import { describe, expect, it } from "vitest";
import { NETWORK_ERROR, friendlyAuthError, validateCredentials } from "./auth-errors";

describe("validateCredentials", () => {
  it("accepts a normal email and password", () => {
    expect(validateCredentials("ana@example.com", "secret1", "signup")).toBeNull();
  });

  it("explains each problem in plain language", () => {
    expect(validateCredentials("", "secret1", "login")).toBe("Enter your email address.");
    expect(validateCredentials("ana", "secret1", "login")).toMatch(/valid email/);
    expect(validateCredentials("ana@example.com", "", "login")).toBe("Enter your password.");
    expect(validateCredentials("ana@example.com", "123", "signup")).toMatch(/at least 6/);
  });

  it("does not check password length on login", () => {
    expect(validateCredentials("ana@example.com", "123", "login")).toBeNull();
  });
});

describe("friendlyAuthError", () => {
  it("maps the common Supabase errors", () => {
    expect(friendlyAuthError({ code: "invalid_credentials" }, "login")).toBe(
      "Wrong email or password. Check them and try again.",
    );
    expect(friendlyAuthError({ message: "User already registered" }, "signup")).toBe(
      "This email is already registered. Log in instead.",
    );
    expect(friendlyAuthError({ code: "weak_password" }, "signup")).toMatch(/at least 6/);
    expect(friendlyAuthError({ name: "AuthRetryableFetchError" }, "login")).toBe(NETWORK_ERROR);
    expect(friendlyAuthError({ message: "Failed to fetch" }, "login")).toBe(NETWORK_ERROR);
    expect(friendlyAuthError({ status: 429 }, "login")).toMatch(/Too many attempts/);
  });

  it("never returns an empty message", () => {
    expect(friendlyAuthError({}, "login")).toBe("We couldn't log you in. Please try again.");
  });
});
