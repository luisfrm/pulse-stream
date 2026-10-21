import { panelApi, type ApiFetchOptions } from "@/lib/api/client";

export const genresService = {
  /** Géneros permitidos (mismo set que valida el backend). */
  async getGenres(options?: ApiFetchOptions): Promise<string[]> {
    return await panelApi<string[]>("/genres", options);
  },
};
