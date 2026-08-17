/** Helpers de formato puros (sin dependencias de React/Next) — testeables. */

/** Muestra el "autor" de una playlist a partir de su email (handle legible). */
export function authorHandle(email: string | null | undefined): string {
  if (!email) return "Pulse Stream";
  const local = email.split("@")[0] ?? "";
  return local.replace(/[._-]+/g, " ").trim() || email;
}

/** Segundos -> "m:ss" (0:07, 12:05, 1:02:03). */
export function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** Bytes -> "1.2 MB" / "3.4 GB". */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || !isFinite(bytes)) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/** Nombre amigable desde un email: "maria.lopez@x.com" -> "Maria". */
export function firstNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const name = local.split(/[._-]+/)[0];
  if (!name) return email;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Saludo por hora del día (es-CO/AR). */
export function greetingForHour(hour: number): string {
  if (hour < 6) return "Buenas noches";
  if (hour < 12) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}