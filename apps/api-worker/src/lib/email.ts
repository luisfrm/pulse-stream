/**
 * Emails transaccionales del Worker.
 *
 * Transporte: **Resend REST** (`https://api.resend.com/emails`) con `fetch`
 * nativo del runtime de Workers, sin SDK. El SDK no aporta nada acá y suma
 * peso al bundle; la API es un POST con un bearer token.
 *
 * En local, sin `RESEND_API_KEY`, `sendEmail` no falla: loguea
 * `email_skipped` y el link de reset se loguea aparte
 * (`password_reset_link_local` en `auth/auth.ts`), así se puede probar el
 * flujo sin inbox.
 *
 * `setEmailSender` es el punto de inyección de los tests: reemplaza el
 * transporte para que la suite de integración nunca toque la red.
 */

import type { AppConfig } from "@/env";

/** Vida del token de reset (better-auth lo usa para `expiresAt`). */
export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 60;

/** Ruta del web que consume el token (página pública). */
export const PASSWORD_RESET_PATH = "/reset-password";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Timeout del POST a Resend: una request colgada no debe colgar el endpoint. */
const RESEND_TIMEOUT_MS = 10_000;

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailSender = (message: EmailMessage) => Promise<void>;

let testSender: EmailSender | undefined;

/** Solo tests: reemplaza el transporte real. */
export function setEmailSender(sender: EmailSender | undefined): void {
  testSender = sender;
}

/**
 * Link absoluto al formulario de reset. El origin sale de `WEB_APP_URL`
 * (config de confianza), nunca del `Origin` del request: el mail no debe
 * apuntar a un host que el atacante controle.
 */
export function buildPasswordResetUrl(webAppUrl: string, token: string): string {
  const url = new URL(PASSWORD_RESET_PATH, webAppUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

/** Escapa los 5 caracteres peligrosos para interpolación en HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Contenido del mail de reset (asunto + HTML + texto plano).
 *
 * Estilos inline (los clientes de correo ignoran `<style>`), paleta del
 * design system y un botón principal + la URL como respaldo para clientes
 * que no renderizan botones. El `username` es dato del usuario: se escapa.
 */
export function renderPasswordResetEmail(params: {
  username: string;
  resetUrl: string;
  expiresInMinutes?: number;
}): { subject: string; html: string; text: string } {
  const { resetUrl, expiresInMinutes = PASSWORD_RESET_TOKEN_TTL_MINUTES } = params;
  const username = escapeHtml(params.username);
  const hours = Math.max(1, Math.round(expiresInMinutes / 60));
  const expiresLabel = hours === 1 ? "1 hora" : `${hours} horas`;
  const subject = "Restablecé tu contraseña · Pulse Stream";

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#0b0f0d;color:#f2f5f3;font-family:Inter,Segoe UI,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f0d;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#131a16;border:1px solid #253029;border-radius:16px;padding:32px;">
            <tr>
              <td style="padding-bottom:8px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#4ade80;">Pulse Stream</td>
            </tr>
            <tr>
              <td style="padding-bottom:16px;font-size:22px;font-weight:700;color:#f2f5f3;">Hola ${username},</td>
            </tr>
            <tr>
              <td style="padding-bottom:24px;font-size:15px;line-height:1.6;color:#a7b3ab;">
                Recibimos un pedido para restablecer la contraseña de tu cuenta.
                El enlace vence en ${expiresLabel} y solo puede usarse una vez.
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:24px;">
                <a href="${resetUrl}" style="display:inline-block;background:#4ade80;color:#0b0f0d;font-weight:600;text-decoration:none;padding:14px 24px;border-radius:999px;">Cambiar mi contraseña</a>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:16px;font-size:13px;line-height:1.6;color:#a7b3ab;">
                Si el botón no funciona, copiá este enlace en tu navegador:<br />
                <a href="${resetUrl}" style="color:#4ade80;word-break:break-all;">${resetUrl}</a>
              </td>
            </tr>
            <tr>
              <td style="padding-top:8px;border-top:1px solid #253029;font-size:13px;line-height:1.6;color:#7d8a82;">
                Si no fuiste vos, ignorá este mensaje: tu contraseña no cambia.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Hola ${params.username},`,
    "",
    "Recibimos un pedido para restablecer la contraseña de tu cuenta.",
    `El enlace vence en ${expiresLabel} y solo puede usarse una vez.`,
    "",
    "Abrí este link para cambiarla:",
    resetUrl,
    "",
    "Si no fuiste vos, ignorá este mensaje: tu contraseña no cambia.",
  ].join("\n");

  return { subject, html, text };
}

/**
 * Envía un mail. Sin transporte configurado en local no falla (loguea);
 * un fallo real de Resend se propaga para que el llamador lo loguee.
 */
export async function sendEmail(
  config: AppConfig,
  message: EmailMessage,
): Promise<void> {
  if (testSender) {
    await testSender(message);
    return;
  }

  const { resendApiKey, from } = config.email;
  if (!resendApiKey || !from) {
    console.info("email_skipped", { reason: "missing_resend_config" });
    return;
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
  });

  if (!response.ok) {
    // Nunca el body: puede incluir el destinatario o el asunto. Tampoco el
    // token (viaja en el HTML).
    console.warn("resend_failed", { status: response.status });
    throw new Error(`Resend rechazó el envío (HTTP ${response.status})`);
  }
}
