import { publicCoverUrl, type AppConfig } from "../../config";
import {
  usernameCandidates,
  usernameFromEmail,
} from "../../lib/username";
import type {
  UserRecord,
  UserRepository,
} from "./repository";
import {
  EmailTakenError,
  GOOGLE_PROVIDER,
  UsernameTakenError,
} from "./repository";
import type { UserRead } from "./schema";

export interface GoogleProfile {
  subject: string;
  email: string;
}

/**
 * Resuelve (o crea) el usuario de un login de Google.
 *
 * Orden:
 * 1. `(provider, provider_account_id)` → cuenta ya vinculada.
 * 2. email lowercase → vincula el provider SIN tocar role/username/
 *    hashed_password (una cuenta del panel conserva sus permisos locales).
 * 3. alta nueva: `hashed_password=NULL`, `is_verified=true`, `role=NULL`,
 *    username derivado del local-part con reintento ante colisión.
 */
export async function resolveGoogleUser(
  profile: GoogleProfile,
  repository: UserRepository,
): Promise<UserRecord> {
  const email = profile.email.trim().toLowerCase();

  const linked = await repository.findByOAuth(
    GOOGLE_PROVIDER,
    profile.subject,
  );
  if (linked) return linked;

  const existing = await repository.findByEmail(email);
  if (existing) {
    await repository.linkOAuth(existing.id, {
      provider: GOOGLE_PROVIDER,
      providerAccountId: profile.subject,
      email,
    });
    return existing;
  }

  const base = usernameFromEmail(email);

  for (const username of usernameCandidates(base)) {
    try {
      return await repository.createUserWithOAuth({
        email,
        username,
        provider: GOOGLE_PROVIDER,
        providerAccountId: profile.subject,
        oauthEmail: email,
      });
    } catch (error) {
      if (error instanceof UsernameTakenError) continue;

      if (error instanceof EmailTakenError) {
        // Carrera: otra request creó la cuenta entre el SELECT y el INSERT.
        const concurrent = await repository.findByEmail(email);
        if (concurrent) {
          await repository.linkOAuth(concurrent.id, {
            provider: GOOGLE_PROVIDER,
            providerAccountId: profile.subject,
            email,
          });
          return concurrent;
        }
      }

      throw error;
    }
  }

  // Caso extremo: los 10 candidatos están tomados. Sufijo aleatorio.
  const fallbackUsername = `${base.slice(0, 40)}-${crypto
    .randomUUID()
    .slice(0, 8)}`;

  return repository.createUserWithOAuth({
    email,
    username: fallbackUsername,
    provider: GOOGLE_PROVIDER,
    providerAccountId: profile.subject,
    oauthEmail: email,
  });
}

/** Mapea el row de DB al contrato `UserRead` (incluye `cover_url` calculada). */
export function toUserRead(user: UserRecord, config: AppConfig): UserRead {
  return {
    id: user.id,
    email: user.email,
    is_active: user.is_active,
    is_verified: user.is_verified,
    is_superuser: user.is_superuser,
    role: user.role === "admin" ? "admin" : null,
    username: user.username,
    cover_key: user.cover_key,
    cover_url: publicCoverUrl(config.r2PublicBaseUrl, user.cover_key),
    total_plays: user.total_plays,
  };
}
