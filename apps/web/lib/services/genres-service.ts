import { api, type ApiFetchOptions } from "@/lib/api/client";

export const genresService = {
  /** Géneros permitidos (mismo set que valida el backend). */
  async getGenres(options?: ApiFetchOptions): Promise<string[]> {
    return await api<string[]>("/genres", options);
  },
};
