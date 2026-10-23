/**
 * CORS: validación de `Origin` igual a la de Starlette.
 *
 * `CORSMiddleware` usa `re.fullmatch(allow_origin_regex, origin)`, es decir el
 * regex debe cubrir el origin COMPLETO. Un `RegExp.test` de JS hace match
 * parcial: `https://luisrivas.site.evil.com` pasaría con el patrón
 * `https://([a-z0-9-]+\.)?luisrivas\.site`. Por eso envolvemos el patrón en
 * `^(?:...)$` antes de testear.
 */

/** Compila el patrón en un matcher equivalente a `re.fullmatch`. */
export function compileOriginMatcher(pattern: string): (origin: string) => boolean {
  let regex: RegExp;
  try {
    regex = new RegExp(`^(?:${pattern})$`);
  } catch {
    // Regex inválida en el env: fallar cerrado (nunca "*" con credenciales).
    return () => false;
  }
  return (origin: string) => regex.test(origin);
}

/**
 * `true` si el origin está permitido. Sin `Origin` (navegación, curl) no hay
 * nada que validar: Hono no agrega headers CORS y la request sigue.
 */
export function isAllowedOrigin(
  origin: string | undefined,
  pattern: string,
): boolean {
  if (!origin) return false;
  return compileOriginMatcher(pattern)(origin);
}
