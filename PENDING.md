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
- **CSRF**: doble submit pendiente antes de producción (ver `AGENTS.md`).
