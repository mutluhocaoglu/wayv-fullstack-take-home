import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";

export const DEVELOPMENT_AUTH_COOKIE = "wayv_dev_auth";

export function isDevelopmentAuthEnabled() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_DEV_AUTH === "true"
  );
}

const authCookiePayloadSchema = z.object({
  userId: z.string().uuid(),
});

function getAuthCookieSecret() {
  const secret = process.env.AUTH_COOKIE_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("AUTH_COOKIE_SECRET must be set to at least 32 characters.");
  }

  return secret;
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSignedAuthCookieValue(userId: string, secret = getAuthCookieSecret()) {
  const payload = Buffer.from(JSON.stringify({ userId })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function readSignedAuthCookieValue(
  value: string | undefined,
  secret = getAuthCookieSecret(),
) {
  if (!value) {
    return null;
  }

  const [payload, signature, ...extraParts] = value.split(".");
  if (!payload || !signature || extraParts.length > 0) {
    return null;
  }

  const expectedSignature = sign(payload, secret);
  const receivedSignature = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    receivedSignature.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(receivedSignature, expectedSignatureBuffer)
  ) {
    return null;
  }

  try {
    const decodedPayload = Buffer.from(payload, "base64url").toString("utf8");
    return authCookiePayloadSchema.parse(JSON.parse(decodedPayload));
  } catch {
    return null;
  }
}

export async function setDevelopmentAuthCookie(userId: string) {
  const cookieStore = await cookies();

  cookieStore.set(DEVELOPMENT_AUTH_COOKIE, createSignedAuthCookieValue(userId), {
    httpOnly: true,
    maxAge: 60 * 60 * 8,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function getDevelopmentAuthUserId() {
  if (!isDevelopmentAuthEnabled()) {
    return null;
  }

  const cookieStore = await cookies();
  const cookie = cookieStore.get(DEVELOPMENT_AUTH_COOKIE);
  return readSignedAuthCookieValue(cookie?.value)?.userId ?? null;
}
