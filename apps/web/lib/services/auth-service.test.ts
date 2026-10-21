import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  api: vi.fn(),
}));

import { authService } from "./auth-service";

// Regresión Fase 4: el login de la app es OAuth-only. El botón debe apuntar al
// endpoint de Google de la API Hono (no a un formulario email/password de
// Python) y encodear `returnTo`.
describe("authService.googleAuthUrl", () => {
  it("apunta a /auth/google de la API y encodea el returnTo", () => {
    const url = authService.googleAuthUrl("/catalog?q=rock");

    expect(url).toMatch(/\/auth\/google\?returnTo=/);
    expect(url.endsWith("returnTo=%2Fcatalog%3Fq%3Drock")).toBe(true);
  });

  it("usa /dashboard por defecto", () => {
    expect(authService.googleAuthUrl()).toMatch(/returnTo=%2Fdashboard$/);
  });
});
