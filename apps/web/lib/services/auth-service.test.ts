import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  api: vi.fn(),
}));

import { api } from "@/lib/api/client";
import { authService } from "./auth-service";

describe("authService: reset de contraseña", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(api).mockResolvedValue(null);
  });

  it("forgotPassword hace POST /auth/forgot-password con el email", async () => {
    await authService.forgotPassword("user@example.com");

    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/auth/forgot-password", {
      method: "POST",
      body: { email: "user@example.com" },
    });
  });

  it("resetPassword hace POST /auth/reset-password con token y password", async () => {
    await authService.resetPassword("tok", "12345678");

    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/auth/reset-password", {
      method: "POST",
      body: { token: "tok", password: "12345678" },
    });
  });
});
