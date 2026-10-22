# Pendientes de auth

- **Reset de contraseña**: no implementado. No hay proveedor de email
  configurado, así que `/auth/reset-password` y `/auth/forgot-password` se
  removieron del panel. Rotación manual:
  `cd apps/api && uv run python scripts/create_admin.py --email ... --password ...`
  (idempotente por email).
- **Verificación de email**: no implementada. Las cuentas del panel se crean
  con `is_verified=true`; no se envía email de confirmación.
- **Alta de usuarios de la app**: hoy son las filas existentes en `users`; el
  registro público y la normalización de cuentas llegan con Better Auth (fase
  siguiente). `users.hashed_password` se mantiene por el auth custom de Hono.
- **`/init` y confianza de red**: `POST /init` no tiene sesión. Sin
  `INIT_TOKEN`, solo se acepta `ENV=local` + loopback directo
  (`127.0.0.1`/`::1`); no se confía en `X-Forwarded-For`. Si el panel/API se
  expone detrás de un proxy o en `dev`/`prod`, configurá `INIT_TOKEN` y mandá
  `X-Init-Token` (la UI del panel no tiene campo de token: en ese escenario se
  hace por curl). El panel local contra `localhost:8000` funciona por loopback.
- **Downgrade de `0012`**: deja el usuario de sistema y las playlists `system`
  intactos (el FK sigue válido), pero elimina `panel_users`: los admins
  panel-only creados con `/init` se pierden. Los admins copiados desde `users`
  siguen existiendo como usuarios legacy.
- **CSRF**: doble submit pendiente antes de producción (ver `AGENTS.md`).
