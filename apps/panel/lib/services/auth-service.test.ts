import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  panelApi: vi.fn(),
}));

import { panelApi } from "@/lib/api/client";
import { authService } from "./auth-service";

describe("panel authService", () => {
  beforeEach(() => {
    vi.mocked(panelApi).mockReset();
  });

  it("hace login form-urlencoded con username/password/remember", async () => {
    vi.mocked(panelApi).mockResolvedValue(undefined);

    await authService.login("admin@pulse.test", "secreto", true);

    const [path, options] = vi.mocked(panelApi).mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: URLSearchParams },
    ];
    expect(path).toBe("/auth/login");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(options.body.get("username")).toBe("admin@pulse.test");
    expect(options.body.get("password")).toBe("secreto");
    expect(options.body.get("remember")).toBe("true");
  });

  it("logout pega a POST /auth/logout", async () => {
    vi.mocked(panelApi).mockResolvedValue(undefined);

    await authService.logout();

    expect(panelApi).toHaveBeenCalledWith("/auth/logout", { method: "POST" });
  });
});
