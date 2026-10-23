/**
 * Integración del reset de contraseña por email (`/auth/forgot-password` +
 * `/auth/reset-password`).
 *
 * El transporte de email está reemplazado por el sender de test
 * (`client.emails`): nada sale a Resend. El token se extrae del texto del mail,
 * igual que lo haría el usuario desde su inbox.
 *
 * Cubre el caso que rompía con el adapter crudo de Drizzle: un reset con token
 * VÁLIDO (el `consumeOne` del adapter usaba `db.transaction()`, que Neon HTTP
 * no soporta).
 */

import { beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { verification } from "@/db/schema";
import {
  PASSWORD,
  createClient,
  describeDb,
  login,
  readJson,
  registerUser,
  resetDb,
  testConfig,
  uniqueEmail,
  type TestClient,
} from "./helpers";

const NEW_PASSWORD = "Nueva-Pass!-99";

/** Token del link `/reset-password?token=...` del mail. */
function resetToken(client: TestClient): string {
  const email = client.emails.at(-1);
  if (!email) throw new Error("no se envió ningún mail");
  const match = /\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(email.text);
  if (!match?.[1]) {
    throw new Error(`el mail no trae un link de reset: ${email.text}`);
  }
  return match[1];
}

describeDb("auth: reset de contraseña por email", () => {
  let client: TestClient;

  beforeEach(async () => {
    await resetDb();
    client = createClient();
  });

  it("flujo completo: pedir link, resetear y loguearse con la nueva", async () => {
    const email = uniqueEmail();
    await registerUser(client, { email });

    const requested = await client.postJson("/auth/forgot-password", { email });
    expect(requested.status).toBe(202);
    expect(await requested.text()).toBe("null");

    expect(client.emails).toHaveLength(1);
    const mail = client.emails[0]!;
    expect(mail.to).toBe(email);
    expect(mail.text).toContain("web.example.test");
    const token = resetToken(client);

    const reset = await client.postJson("/auth/reset-password", {
      token,
      password: NEW_PASSWORD,
    });
    expect(reset.status).toBe(200);
    expect(await reset.text()).toBe("null");

    // La password vieja ya no sirve.
    const oldLogin = await login(client, email, PASSWORD);
    expect(oldLogin.status).toBe(400);
    expect(await readJson(oldLogin)).toEqual({
      detail: "LOGIN_BAD_CREDENTIALS",
    });

    // La nueva sí.
    const newLogin = await login(client, email, NEW_PASSWORD);
    expect(newLogin.status).toBe(204);
  });

  it("el token es de un solo uso", async () => {
    const email = uniqueEmail();
    await registerUser(client, { email });

    await client.postJson("/auth/forgot-password", { email });
    const token = resetToken(client);

    const first = await client.postJson("/auth/reset-password", {
      token,
      password: NEW_PASSWORD,
    });
    expect(first.status).toBe(200);

    const reused = await client.postJson("/auth/reset-password", {
      token,
      password: "Otra-Pass!-123",
    });
    expect(reused.status).toBe(400);
    expect(await readJson(reused)).toEqual({
      detail: "RESET_PASSWORD_BAD_TOKEN",
    });
  });

  it("email inexistente: 202 y ningún mail", async () => {
    await registerUser(client, { email: uniqueEmail() });
    client.emails.length = 0;

    const response = await client.postJson("/auth/forgot-password", {
      email: uniqueEmail("desconocido"),
    });

    expect(response.status).toBe(202);
    expect(await response.text()).toBe("null");
    expect(client.emails).toHaveLength(0);
  });

  it("token expirado -> 400 RESET_PASSWORD_BAD_TOKEN", async () => {
    const user = await registerUser(client, { email: uniqueEmail() });
    const token = crypto.randomUUID();

    await createDb(testConfig()).insert(verification).values({
      id: crypto.randomUUID(),
      identifier: `reset-password:${token}`,
      value: user.id,
      expiresAt: new Date(Date.now() - 60_000),
    });

    const response = await client.postJson("/auth/reset-password", {
      token,
      password: NEW_PASSWORD,
    });
    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      detail: "RESET_PASSWORD_BAD_TOKEN",
    });
  });

  it("pedir un link nuevo invalida el anterior", async () => {
    const email = uniqueEmail();
    await registerUser(client, { email });

    await client.postJson("/auth/forgot-password", { email });
    const firstToken = resetToken(client);

    await client.postJson("/auth/forgot-password", { email });
    const secondToken = resetToken(client);
    expect(secondToken).not.toBe(firstToken);
    expect(client.emails).toHaveLength(2);

    const stale = await client.postJson("/auth/reset-password", {
      token: firstToken,
      password: NEW_PASSWORD,
    });
    expect(stale.status).toBe(400);
    expect(await readJson(stale)).toEqual({
      detail: "RESET_PASSWORD_BAD_TOKEN",
    });

    const current = await client.postJson("/auth/reset-password", {
      token: secondToken,
      password: NEW_PASSWORD,
    });
    expect(current.status).toBe(200);
  });

  it("resetear revoca las sesiones abiertas", async () => {
    const email = uniqueEmail();
    const sessionClient = createClient();
    await registerUser(sessionClient, { email });
    expect((await login(sessionClient, email)).status).toBe(204);
    expect((await sessionClient.get("/users/me")).status).toBe(200);

    // Otro dispositivo pide el link y cambia la password.
    const otherClient = createClient();
    await otherClient.postJson("/auth/forgot-password", { email });
    const token = resetToken(otherClient);
    const reset = await otherClient.postJson("/auth/reset-password", {
      token,
      password: NEW_PASSWORD,
    });
    expect(reset.status).toBe(200);

    // La sesión vieja quedó revocada.
    expect((await sessionClient.get("/users/me")).status).toBe(401);
  });
});
