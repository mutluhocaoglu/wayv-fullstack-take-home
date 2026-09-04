import { describe, expect, it } from "vitest";
import {
  createSignedAuthCookieValue,
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
});
