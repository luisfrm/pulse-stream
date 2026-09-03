"""Backfill one-off: Cache-Control inmutable en los covers existentes.

Los covers nuevos ya salen con `Cache-Control: public, max-age=31536000,
immutable` firmado en el presign (las keys con UUID son inmutables). Este
script se lo pone a los objetos `covers/*` ya subidos, copiándolos sobre sí
mismos con MetadataDirective=REPLACE (solo cambia metadata, no los bytes).

Uso:
    uv run python scripts/backfill_cover_cache.py --dry-run   # lista, no toca
    uv run python scripts/backfill_cover_cache.py --apply     # aplica
"""

import argparse
import os
import sys

sys.path.insert(0, ".")

from app.core.config import settings
from app.features.uploads.service import COVER_CACHE_CONTROL, R2Storage

# Content-Type por extensión conocida. Las extensiones desconocidas se
# preservan vía `head_object` (ver `R2Storage.head_content_type`): adivinar
# "image/jpeg" para todo lo no-webp corrompería la metadata de PNGs u otros.
CONTENT_TYPES_BY_EXTENSION = {
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}


def _content_type_for(storage: R2Storage, key: str) -> str | None:
    ext = os.path.splitext(key)[1].lower()
    if ext in CONTENT_TYPES_BY_EXTENSION:
        return CONTENT_TYPES_BY_EXTENSION[ext]
    # Extensión desconocida: preservar el Content-Type real del objeto.
    return storage.head_content_type(key)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true")
    group.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    storage = R2Storage()
    if not storage.enabled:
        print("R2 no configurado (faltan env vars R2_*).")
        return 1
    assert settings.r2_bucket_name is not None

    keys = storage.list_keys("covers/")

    print(f"covers/* encontrados: {len(keys)}")
    if args.dry_run:
        for key in keys[:20]:
            print(f"  {key}")
        if len(keys) > 20:
            print(f"  ... y {len(keys) - 20} más")
        return 0

    updated = 0
    for key in keys:
        content_type = _content_type_for(storage, key)
        if content_type is None:
            print(f"  salto {key}: no se pudo determinar el Content-Type")
            continue
        storage.replace_cache_control(key, COVER_CACHE_CONTROL, content_type)
        updated += 1
    print(f"actualizados: {updated} (Cache-Control: {COVER_CACHE_CONTROL})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
