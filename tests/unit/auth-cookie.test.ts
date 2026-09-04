import { describe, expect, it } from "vitest";
import {
  createSignedAuthCookieValue,
  isDevelopmentAuthEnabled,
  readSignedAuthCookieValue,
} from "@/server/auth/cookie";

const secret = "test-auth-cookie-secret-that-is-long-enough";
const userId = "00000000-0000-4000-8000-000000000001";

describe("development authentication cookie", () => {
  it("accepts a valid signed user ID", () => {
    const cookie = createSignedAuthCookieValue(userId, secret);

    expect(readSignedAuthCookieValue(cookie, secret)).toEqual({ userId });
  });

  it("rejects a tampered cookie", () => {
    const cookie = createSignedAuthCookieValue(userId, secret);
    const tamperedCookie = `${cookie.slice(0, -1)}x`;

    expect(readSignedAuthCookieValue(tamperedCookie, secret)).toBeNull();
  });

  it("disables development authentication in production", () => {
    const environment = process.env as { NODE_ENV?: string };
    const originalNodeEnv = environment.NODE_ENV;
    environment.NODE_ENV = "production";

    try {
      expect(isDevelopmentAuthEnabled()).toBe(false);
    } finally {
      environment.NODE_ENV = originalNodeEnv;
    }
  });
});
