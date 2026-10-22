import { describe, expect, it } from "vitest";

import { DEFAULT_PANEL_NEXT, sanitizeNextPath } from "./next-path";

describe("sanitizeNextPath", () => {
  it("acepta rutas internas del panel", () => {
    expect(sanitizeNextPath("/panel")).toBe("/panel");
    expect(sanitizeNextPath("/panel/")).toBe("/panel/");
    expect(sanitizeNextPath("/panel/songs?q=x#top")).toBe(
      "/panel/songs?q=x#top",
    );
  });

  it("usa /panel ante valores ausentes o inválidos", () => {
    expect(sanitizeNextPath(undefined)).toBe(DEFAULT_PANEL_NEXT);
    expect(sanitizeNextPath(null)).toBe(DEFAULT_PANEL_NEXT);
    expect(sanitizeNextPath("")).toBe(DEFAULT_PANEL_NEXT);
    expect(sanitizeNextPath("/login")).toBe(DEFAULT_PANEL_NEXT);
    expect(sanitizeNextPath("/panel-evil")).toBe(DEFAULT_PANEL_NEXT);
  });

  it("rechaza esquemas, //, backslashes, controles y traversal", () => {
    for (const value of [
      "https://evil.example",
      "javascript:alert(1)",
      "//evil.example",
      "/\\evil.example",
      "/panel\u0000",
      "/panel\n/../login",
      "/panel/../login",
      "/panel/./login",
      "/panel//evil",
    ]) {
      expect(sanitizeNextPath(value)).toBe(DEFAULT_PANEL_NEXT);
    }
  });

  it("maneja string[] sin elegir un valor arbitrario", () => {
    expect(sanitizeNextPath(["/panel/songs"])).toBe("/panel/songs");
    expect(sanitizeNextPath(["/panel/artists", "/panel/songs"])).toBe(
      DEFAULT_PANEL_NEXT,
    );
  });
});
