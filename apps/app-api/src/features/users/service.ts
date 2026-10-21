import { publicCoverUrl, type AppConfig } from "../../config";
import type { UserRecord } from "./repository";
import type { UserRead } from "./schema";

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
