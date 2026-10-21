import { describe, expect, it } from "vitest";

import {
  USERNAME_MAX_LENGTH,
  generateUsername,
  sanitizeUsername,
  usernameCandidates,
  usernameFromEmail,
} from "../src/lib/username";

describe("username generator", () => {
  it("sanitiza el local-part: acentos, mayúsculas y caracteres inválidos", () => {
    expect(usernameFromEmail("José.Núñez+music@example.com")).toBe(
      "jose.nunez-music",
    );
    expect(usernameFromEmail("  John__Doe  @example.com")).toBe("john_doe");
  });

  it("usa 'user' cuando el local-part no deja caracteres válidos", () => {
    expect(usernameFromEmail("!!!@example.com")).toBe("user");
    expect(sanitizeUsername("")).toBe("user");
  });

  it("nunca supera el máximo de 50 chars", () => {
    const username = usernameFromEmail(`${"a".repeat(120)}@example.com`);
    expect(username.length).toBeLessThanOrEqual(USERNAME_MAX_LENGTH);
  });

  it("respeta el largo al agregar sufijos de colisión", () => {
    const base = "a".repeat(40);
    const candidates = usernameCandidates(base);

    expect(candidates[0]).toBe(base);
    expect(candidates[1]).toBe(`${base}-2`);
    for (const candidate of candidates) {
      expect(candidate.length).toBeLessThanOrEqual(USERNAME_MAX_LENGTH);
    }
  });

  it("genera sufijos -2, -3, ... ante colisiones", async () => {
    const taken = new Set(["john", "john-2"]);

    await expect(
      generateUsername("john", (candidate) => taken.has(candidate)),
    ).resolves.toBe("john-3");
  });

  it("cae a un sufijo aleatorio si todos los candidatos están tomados", async () => {
    const username = await generateUsername("john", () => true);

    expect(username).toMatch(/^john-[0-9a-f]{8}$/);
    expect(username.length).toBeLessThanOrEqual(USERNAME_MAX_LENGTH);
  });
});
