/**
 * Unit tests del transporte de email (sin DB ni red).
 *
 * Cubren: el escapado del HTML (el username es dato del usuario), el skip
 * silencioso sin config de Resend y el POST real (mockeado) con su manejo de
 * errores.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { createConfig, type Bindings } from "@/env";
import {
  RESEND_ENDPOINT,
  buildPasswordResetUrl,
  renderPasswordResetEmail,
  sendEmail,
  setEmailSender,
  type EmailMessage,
} from "./email";

const bindings = (overrides: Partial<Bindings> = {}): Bindings => ({
  ENV: "local",
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setEmailSender(undefined);
});

describe("buildPasswordResetUrl", () => {
  it("arma el link absoluto al formulario del web", () => {
    expect(
      buildPasswordResetUrl("https://web.example.test", "abc-123"),
    ).toBe("https://web.example.test/reset-password?token=abc-123");
  });
});

describe("renderPasswordResetEmail", () => {
  it("escapa el username (dato del usuario)", () => {
    const email = renderPasswordResetEmail({
      username: '<script>alert("x")</script>',
      resetUrl: "https://web.example.test/reset-password?token=tok",
    });

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    // El texto plano no interpreta HTML: el nombre sale tal cual.
    expect(email.text).toContain('<script>alert("x")</script>');
  });

  it("incluye la URL, la vigencia y el asunto", () => {
    const url = "https://web.example.test/reset-password?token=tok";
    const email = renderPasswordResetEmail({ username: "lu", resetUrl: url });

    expect(email.subject).toBe("Restablecé tu contraseña · Pulse Stream");
    for (const part of [email.html, email.text]) {
      expect(part).toContain(url);
      expect(part).toContain("1 hora");
    }
    expect(email.html).toContain("solo puede usarse una vez");
  });
});

describe("sendEmail", () => {
  it("sin API key no llama a fetch ni falla", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await sendEmail(createConfig(bindings()), {
      to: "user@example.test",
      subject: "Hola",
      html: "<p>Hola</p>",
      text: "Hola",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("email_skipped", {
      reason: "missing_resend_config",
    });
  });

  it("con config hace POST a Resend con el bearer y el JSON esperado", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const config = createConfig(
      bindings({
        RESEND_API_KEY: "re_test_key",
        EMAIL_FROM: "Pulse Stream <no-reply@example.test>",
      }),
    );
    const message: EmailMessage = {
      to: "user@example.test",
      subject: "Restablecé tu contraseña",
      html: "<p>html</p>",
      text: "texto",
    };

    await sendEmail(config, message);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(RESEND_ENDPOINT);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer re_test_key",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      from: "Pulse Stream <no-reply@example.test>",
      to: ["user@example.test"],
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  });

  it("un 403 de Resend loguea el status y lanza", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 })),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const config = createConfig(
      bindings({
        RESEND_API_KEY: "re_test_key",
        EMAIL_FROM: "Pulse Stream <no-reply@example.test>",
      }),
    );

    await expect(
      sendEmail(config, {
        to: "user@example.test",
        subject: "x",
        html: "<p>x</p>",
        text: "x",
      }),
    ).rejects.toThrow(/403/);

    expect(warn).toHaveBeenCalledWith("resend_failed", { status: 403 });
  });

  it("usa el sender inyectado en tests y no toca fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const sent: EmailMessage[] = [];
    setEmailSender(async (message) => {
      sent.push(message);
    });

    const config = createConfig(bindings());
    await sendEmail(config, {
      to: "user@example.test",
      subject: "x",
      html: "<p>x</p>",
      text: "x",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
  });
});
