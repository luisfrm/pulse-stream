/**
 * Gate de paridad del contrato OpenAPI contra el backend Python (Pydantic).
 *
 * El web consume `components["schemas"]` generado con `openapi-typescript`
 * desde el OpenAPI de la API Python; este Worker debe exponer exactamente los
 * mismos nombres y la misma forma. El fixture
 * `__fixtures__/openapi-contract.json` se genera con `pnpm gen:contract` a
 * partir del `app.openapi()` de `apps/api` (ver `scripts/gen-contract-fixture.ts`).
 *
 * Cualquier regresión de forma (campo que desaparece, `required` que cambia,
 * `default` que se pierde, `$ref` que apunta a otro lado) rompe este test.
 */

import { describe, expect, it } from "vitest";

import { app } from "@/index";
import {
  CONTRACT_DEVIATIONS,
  normalizeComponents,
  type NormalizedComponents,
} from "@/lib/contract";
import { OPENAPI_VERSION, openApiInfo } from "@/lib/openapi";
import pydanticContract from "@/lib/__fixtures__/openapi-contract.json";

const document = app.getOpenAPI31Document({
  openapi: OPENAPI_VERSION,
  info: openApiInfo,
});

const ourComponents = normalizeComponents(document.components?.schemas ?? {});
const expected = pydanticContract as NormalizedComponents;

/** Nombres que `apps/web/lib/services/types.ts` importa del contrato. */
const WEB_CONSUMED_COMPONENTS = [
  "UserRead",
  "ArtistRead",
  "SongRead",
  "SongWithPlays",
  "RecentlyPlayedSong",
  "AlbumRead",
  "AlbumDetail",
  "ZipImportResult",
  "ZipImportIssue",
  "ListenRead",
  "PresignResponse",
  "SongGenre",
  "PlaylistRead",
  "PlaylistDetail",
  "MyPlaylistRead",
] as const;

/** Nombres reales de Pydantic para `Page<T>` (con guion bajo final). */
const PAGE_COMPONENTS = [
  "Page_AlbumRead_",
  "Page_ArtistRead_",
  "Page_MyPlaylistRead_",
  "Page_PlaylistRead_",
  "Page_RecentlyPlayedSong_",
  "Page_SongRead_",
] as const;

describe("contrato OpenAPI vs backend Python", () => {
  it("expone exactamente los mismos componentes (salvo desviaciones)", () => {
    const ourNames = Object.keys(ourComponents).sort();
    const expectedNames = [...Object.keys(expected), ...CONTRACT_DEVIATIONS].sort();
    expect(ourNames).toEqual(expectedNames);
  });

  it.each(Object.keys(expected))("%s tiene la misma forma que Pydantic", (name) => {
    expect(ourComponents[name]).toEqual(expected[name]);
  });

  it("no registra alias de páginas que Pydantic no emite", () => {
    const pageNames = Object.keys(ourComponents)
      .filter((name) => name.startsWith("Page"))
      .sort();
    expect(pageNames).toEqual([...PAGE_COMPONENTS].sort());
  });

  it.each(WEB_CONSUMED_COMPONENTS)("el web puede importar %s", (name) => {
    expect(ourComponents).toHaveProperty([name]);
  });

  it.each(CONTRACT_DEVIATIONS)(
    "%s no acepta campos de privilegio (desviación deliberada)",
    (name) => {
      const node = ourComponents[name];
      expect(node?.kind).toBe("object");
      if (node?.kind !== "object") return;

      expect(Object.keys(node.properties)).not.toContain("role");
      expect(Object.keys(node.properties)).not.toContain("is_superuser");
      expect(Object.keys(node.properties)).not.toContain("is_active");
      expect(Object.keys(node.properties)).not.toContain("is_verified");
    },
  );
});
