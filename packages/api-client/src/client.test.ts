import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMock, cookiesMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  cookiesMock: vi.fn(),
}));

vi.mock("ofetch", () => ({ ofetch: { create: createMock } }));
vi.mock("next/headers", () => ({ cookies: cookiesMock }));

import { createApiClient } from "./client";

function lastConfig() {
  const call = createMock.mock.calls.at(-1);
  if (!call) throw new Error("ofetch.create no fue llamado");
  return call[0] as {
    baseURL?: string;
    onRequest: (ctx: { options: Record<string, unknown> }) => Promise<void>;
  };
}

describe("createApiClient", () => {
  beforeEach(() => {
    createMock.mockReset();
    cookiesMock.mockReset();
    createMock.mockReturnValue(vi.fn());
  });

  it("crea el cliente con la baseURL recibida", () => {
    createApiClient({ baseURL: "http://localhost:8000", cookieName: "session" });
    expect(lastConfig().baseURL).toBe("http://localhost:8000");
  });

  it("en el servidor reenvía SOLO la cookie configurada", async () => {
    cookiesMock.mockResolvedValue({
      get: (name: string) =>
        name === "session" ? { value: "abc" } : { value: "otra" },
    });
    createApiClient({ baseURL: "http://api", cookieName: "session" });

    const options: { headers?: Headers } = {};
    await lastConfig().onRequest({ options });

    expect(options.headers?.get("cookie")).toBe("session=abc");
  });

  it("no reenvía cookie si el request no la trae", async () => {
    cookiesMock.mockResolvedValue({ get: () => undefined });
    createApiClient({ baseURL: "http://api", cookieName: "panel_session" });

    const options: { headers?: Headers } = {};
    await lastConfig().onRequest({ options });

    expect(options.headers).toBeUndefined();
  });

  it("sin cookieName no toca next/headers (cliente público)", async () => {
    createApiClient({ baseURL: "http://api" });

    const options: { headers?: Headers } = {};
    await lastConfig().onRequest({ options });

    expect(cookiesMock).not.toHaveBeenCalled();
    expect(options.headers).toBeUndefined();
  });
});
