/**
 * Errores: el 500 mantiene el body de Python y el log NO filtra datos.
 *
 * Los errores de Drizzle/Neon traen la SQL + los parámetros y los de
 * better-auth traen `body` (respuestas con credenciales): `toSafeErrorLog`
 * extrae solo name/message/code/stack.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "@/index";
import { toSafeErrorLog } from "@/lib/log";
import { testBindings } from "./helpers";

describe("toSafeErrorLog", () => {
  it("se queda con nombre, mensaje, código y stack", () => {
    const error = Object.assign(new Error("boom"), { code: "42P01" });
    const safe = toSafeErrorLog(error);

    expect(safe.name).toBe("Error");
    expect(safe.message).toBe("boom");
    expect(safe.code).toBe("42P01");
    expect(safe.stack).toContain("boom");
  });

  it("NO copia body, query, params, sql ni cause", () => {
    const error = Object.assign(new Error("falló la query"), {
      query: "INSERT INTO users (email) VALUES ($1)",
      params: ["ana@example.com"],
      body: { password: "secret" },
      cause: { token: "abc" },
      sql: "select 1",
    });

    const safe = toSafeErrorLog(error) as unknown as Record<string, unknown>;

    expect(Object.keys(safe).sort()).toEqual(["message", "name", "stack"]);
    expect(JSON.stringify(safe)).not.toContain("ana@example.com");
    expect(JSON.stringify(safe)).not.toContain("secret");
  });

  it("trunca stacks gigantes y tolera valores que no son Error", () => {
    const huge = Object.assign(new Error("x"), { stack: "s".repeat(5000) });
    expect(toSafeErrorLog(huge).stack?.length).toBe(2000);

    expect(toSafeErrorLog("texto")).toEqual({
      name: "string",
      message: "texto",
    });
  });
});

describe("onError (500)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("responde el body de FastAPI y loguea el error redactado", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createApp();

    // Ruta de prueba en una app NUEVA (no contamina la instancia global).
    app.get("/__boom", () => {
      throw Object.assign(new Error("kaboom"), {
        params: ["dato-sensible"],
        body: { password: "dato-sensible" },
      });
    });

    const response = await app.request("/__boom", {}, testBindings());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ detail: "Error interno" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [, logged] = errorSpy.mock.calls[0] ?? [];
    expect(logged).toMatchObject({ name: "Error", message: "kaboom" });
    expect(JSON.stringify(logged)).not.toContain("dato-sensible");
  });
});
