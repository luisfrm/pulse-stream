import type { FetchOptions, ResponseType } from "ofetch";

/** Opciones nativas de Next.js para el fetch (caché con tags). */
export type NextFetchConfig = {
  revalidate?: number | false;
  tags?: string[];
};

/**
 * Opciones del cliente `api`: las de `ofetch` más `next` para el
 * cache tagging de Next.js 16 (RSC).
 */
export type ApiFetchOptions<R extends ResponseType = "json"> = Omit<
  FetchOptions<R>,
  "body"
> & {
  body?: FetchOptions<R>["body"];
  next?: NextFetchConfig;
};
