import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import {
  SESSION_AUDIENCE,
  SESSION_ISSUER,
  signSession,
  verifySession,
} from "../src/auth/session";
import { TEST_SECRET, TEST_USER_ID } from "./helpers";

async function signCustom(overrides: {
  secret?: string;
  audience?: string;
  issuer?: string;
  expiresInSeconds?: number;
  includeSubject?: boolean;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  let token = new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setAudience(overrides.audience ?? SESSION_AUDIENCE)
    .setIssuer(overrides.issuer ?? SESSION_ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + (overrides.expiresInSeconds ?? 60));

  if (overrides.includeSubject !== false) {
    token = token.setSubject(TEST_USER_ID);
  }

  return token.sign(
    new TextEncoder().encode(overrides.secret ?? TEST_SECRET),
  );
}

describe("sesión JWT (HS256)", () => {
  it("firma y verifica con aud/iss explícitos", async () => {
    const token = await signSession(TEST_USER_ID, TEST_SECRET);

    await expect(verifySession(token, TEST_SECRET)).resolves.toEqual({
      sub: TEST_USER_ID,
    });
  });

  it("falla con otro secreto", async () => {
    const token = await signSession(TEST_USER_ID, TEST_SECRET);

    await expect(
      verifySession(token, "another-secret-with-enough-entropy"),
    ).rejects.toThrow();
  });

  it("falla con otra audiencia", async () => {
    const token = await signCustom({ audience: "pulse-panel" });

    await expect(verifySession(token, TEST_SECRET)).rejects.toThrow();
  });

  it("falla con otro issuer", async () => {
    const token = await signCustom({ issuer: "another-issuer" });

    await expect(verifySession(token, TEST_SECRET)).rejects.toThrow();
  });

  it("falla con un token expirado", async () => {
    const token = await signSession(TEST_USER_ID, TEST_SECRET, -60);

    await expect(verifySession(token, TEST_SECRET)).rejects.toThrow();
  });

  it("falla si el token no tiene sub", async () => {
    const token = await signCustom({ includeSubject: false });

    await expect(verifySession(token, TEST_SECRET)).rejects.toThrow();
  });

  it("rechaza firmar sin subject o sin secreto", async () => {
    await expect(signSession("", TEST_SECRET)).rejects.toThrow();
    await expect(signSession(TEST_USER_ID, "")).rejects.toThrow();
  });
});
