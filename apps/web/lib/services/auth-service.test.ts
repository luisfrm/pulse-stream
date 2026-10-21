import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  api: vi.fn(),
}));

import { api } from "@/lib/api/client";
import { authService } from "./auth-service";

describe("authService.login", () => {
  it("hace POST /auth/login con identifier/password", async () => {
    vi.mocked(api).mockResolvedValue(undefined);

    await authService.login({
      identifier: "panel-admin",
      password: "Password-123!",
    });

    expect(api).toHaveBeenCalledWith("/auth/login", {
      method: "POST",
      body: {
        identifier: "panel-admin",
        password: "Password-123!",
      },
    });
  });
});
