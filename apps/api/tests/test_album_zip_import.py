"""Import por ZIP de un álbum completo (POST /albums/{id}/import-zip).

Se testea con un storage falso (no hay R2 en los tests): el service se
inyecta por dependency_overrides con el mismo session de la base de tests.
"""

import io
import uuid
import zipfile

import pytest
from mutagen.id3 import ID3, TIT2

from app.features.albums.repository import AlbumRepository
from app.features.artists.repository import ArtistRepository
from app.features.songs.repository import SongRepository
from app.features.songs.service import SongService
from app.features.uploads.service import ZipImportService, get_zip_import_service
from app.main import app
from tests.helpers import login, register_and_login


class FakeStorage:
    """Reemplaza R2Storage: registra los PUT sin tocar la red."""

    enabled = True

    def __init__(self) -> None:
        self.objects: list[tuple[str, bytes, str]] = []

    def put_object(self, object_key: str, data: bytes, content_type: str) -> None:
        self.objects.append((object_key, data, content_type))


class FailingStorage:
    """Falla en el N-ésimo PUT para verificar que no aborta el resto."""

    enabled = True

    def __init__(self, fail_on_call: int = 2) -> None:
        self.objects: list[tuple[str, bytes, str]] = []
        self.calls = 0
        self.fail_on_call = fail_on_call

    def put_object(self, object_key: str, data: bytes, content_type: str) -> None:
        self.calls += 1
        if self.calls == self.fail_on_call:
            raise RuntimeError("R2 unavailable")
        self.objects.append((object_key, data, content_type))


def _mp3_bytes(title: str) -> bytes:
    """MP3 mínimo legible por mutagen: tag ID3 con TIT2 + frames MPEG1.

    mutagen necesita ver DOS frames consecutivos para validar el header
    (HeaderNotFoundError con uno solo); la duración del mínimo es ~0.05 s,
    que el service redondea a 1.
    """
    tag = ID3()
    tag.add(TIT2(encoding=3, text=[title]))
    buf = io.BytesIO()
    tag.save(buf)
    frame = b"\xff\xfb\x90\x00" + b"\x00" * 413
    return buf.getvalue() + frame * 2


def _mp3_no_id3_bytes() -> bytes:
    """MP3 sin tags ID3: el service debe usar el nombre de archivo como título."""
    frame = b"\xff\xfb\x90\x00" + b"\x00" * 413
    return frame * 2


def _zip_bytes(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return buf.getvalue()


@pytest.fixture
async def import_client(client, session):
    """Cliente con el ZipImportService inyectado (storage falso)."""
    storage = FakeStorage()

    def override() -> ZipImportService:
        songs_repo = SongRepository(session)
        albums_repo = AlbumRepository(session)
        artists_repo = ArtistRepository(session)
        return ZipImportService(
            songs_repository=songs_repo,
            albums_repository=albums_repo,
            song_service=SongService(songs_repo, artists_repo, albums_repo),
            storage=storage,
        )

    app.dependency_overrides[get_zip_import_service] = override
    try:
        yield client, storage
    finally:
        app.dependency_overrides.pop(get_zip_import_service, None)


async def _create_album(client) -> tuple[dict, dict]:
    # Nombre único por corrida: el nombre del artista es UNIQUE en la DB y
    # los tests comparten la misma base (aislamiento entre tests).
    artist_name = f"Bad Bunny {uuid.uuid4().hex[:6]}"
    artist = (
        await client.post("/artists", json={"name": artist_name})
    ).json()
    album = (
        await client.post(
            "/albums",
            json={
                "title": "Un Verano Sin Ti",
                "artist_id": artist["id"],
                "cover_key": "covers/uvst.jpg",
            },
        )
    ).json()
    return artist, album


async def _create_song(client, artist: dict, album: dict, title: str) -> dict:
    resp = await client.post(
        "/songs",
        json={
            "title": title,
            "artist_id": artist["id"],
            "album_id": album["id"],
            "object_key": f"songs/{uuid.uuid4().hex}.mp3",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_import_zip_creates_songs_with_album_data(import_client, session):
    client, storage = import_client
    await register_and_login(client, admin=True, session=session)
    artist, album = await _create_album(client)

    zip_data = _zip_bytes(
        {
            "01 - Titulo Uno.mp3": _mp3_bytes("Título Uno"),
            "02 - Titulo Dos.mp3": _mp3_bytes("Título Dos"),
            "Portada.jpg": b"not an image",
            "03 - Duplicado.mp3": _mp3_bytes("Título Uno"),
            "folder/04 - Cuatro.mp3": _mp3_bytes("Cuatro"),
        }
    )

    resp = await client.post(
        f"/albums/{album['id']}/import-zip",
        files={"file": ("album.zip", zip_data, "application/zip")},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert [s["title"] for s in data["imported"]] == [
        "Título Uno",
        "Título Dos",
        "Cuatro",
    ]
    for song in data["imported"]:
        assert song["album"]["id"] == album["id"]
        assert song["artist"]["id"] == artist["id"]
        assert song["cover_key"] == "covers/uvst.jpg"
        assert song["duration_seconds"] == 1
        assert song["object_key"].startswith("songs/")

    skipped = {item["name"]: item["reason"] for item in data["skipped"]}
    assert "Portada.jpg" in skipped
    assert "03 - Duplicado.mp3" in skipped
    assert data["failed"] == []

    assert len(storage.objects) == 3
    assert all(ct == "audio/mpeg" for _, _, ct in storage.objects)


async def test_import_zip_requires_admin(import_client, session):
    client, _ = import_client
    admin = await register_and_login(client, admin=True, session=session)
    artist, album = await _create_album(client)
    # El register/login del usuario normal COMMITEA la sesión compartida
    # (fastapi-users commitea interno): el artista/álbum quedan en la DB.
    # Se limpian en finally para no contaminar otros tests.
    try:
        await register_and_login(client, admin=False)
        resp = await client.post(
            f"/albums/{album['id']}/import-zip",
            files={"file": ("album.zip", _zip_bytes({}), "application/zip")},
        )
        assert resp.status_code == 403
    finally:
        await login(client, admin["email"])
        await client.delete(f"/albums/{album['id']}")
        await client.delete(f"/artists/{artist['id']}")
        # Los DELETE quedan pendientes en la sesión compartida (get_session de
        # tests no commitea): commit explícito para no filtrar datos.
        await session.commit()


async def test_import_zip_rejects_invalid_zip(import_client, session):
    client, _ = import_client
    await register_and_login(client, admin=True, session=session)
    _, album = await _create_album(client)

    resp = await client.post(
        f"/albums/{album['id']}/import-zip",
        files={"file": ("album.zip", b"this is not a zip", "application/zip")},
    )
    assert resp.status_code == 400
    assert "ZIP" in resp.json()["detail"]


async def test_import_zip_album_not_found(import_client, session):
    client, _ = import_client
    await register_and_login(client, admin=True, session=session)

    resp = await client.post(
        f"/albums/{'00000000-0000-0000-0000-000000000000'}/import-zip",
        files={"file": ("album.zip", _zip_bytes({}), "application/zip")},
    )
    assert resp.status_code == 404


async def test_import_zip_rejects_unparseable_audio(import_client, session):
    client, storage = import_client
    await register_and_login(client, admin=True, session=session)
    _, album = await _create_album(client)

    resp = await client.post(
        f"/albums/{album['id']}/import-zip",
        files={
            "file": (
                "album.zip",
                _zip_bytes({"fake.mp3": b"this is not audio"}),
                "application/zip",
            )
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert len(data["failed"]) == 1
    assert "no es un audio válido" in data["failed"][0]["reason"].lower()
    assert storage.objects == []


async def test_import_zip_fallback_title_when_no_id3(import_client, session):
    client, storage = import_client
    await register_and_login(client, admin=True, session=session)
    _, album = await _create_album(client)

    resp = await client.post(
        f"/albums/{album['id']}/import-zip",
        files={
            "file": (
                "album.zip",
                _zip_bytes({"Sin Tag.mp3": _mp3_no_id3_bytes()}),
                "application/zip",
            )
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert [s["title"] for s in data["imported"]] == ["Sin Tag"]
    assert len(storage.objects) == 1


async def test_import_zip_accepts_aac_extension(import_client, session):
    client, storage = import_client
    await register_and_login(client, admin=True, session=session)
    _, album = await _create_album(client)

    resp = await client.post(
        f"/albums/{album['id']}/import-zip",
        files={
            "file": (
                "album.zip",
                _zip_bytes({"track.aac": _mp3_bytes("Tema AAC")}),
                "application/zip",
            )
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["imported"][0]["title"] == "Tema AAC"
    assert len(storage.objects) == 1
    assert storage.objects[0][2] == "audio/aac"


async def test_import_zip_skips_oversized_file(import_client, session):
    from app.core.config import settings

    client, storage = import_client
    await register_and_login(client, admin=True, session=session)
    _, album = await _create_album(client)

    original_max = settings.r2_max_upload_bytes
    settings.r2_max_upload_bytes = 100
    try:
        resp = await client.post(
            f"/albums/{album['id']}/import-zip",
            files={
                "file": (
                    "album.zip",
                    _zip_bytes({"big.mp3": _mp3_bytes("Big")}),
                    "application/zip",
                )
            },
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert len(data["skipped"]) == 1
        assert "MB" in data["skipped"][0]["reason"]
        assert storage.objects == []
    finally:
        settings.r2_max_upload_bytes = original_max


async def test_import_zip_duplicate_preexisting(import_client, session):
    client, storage = import_client
    await register_and_login(client, admin=True, session=session)
    artist, album = await _create_album(client)
    await _create_song(client, artist, album, "Título Uno")

    resp = await client.post(
        f"/albums/{album['id']}/import-zip",
        files={
            "file": (
                "album.zip",
                _zip_bytes({"01 - Titulo Uno.mp3": _mp3_bytes("Título Uno")}),
                "application/zip",
            )
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["imported"] == []
    assert len(data["skipped"]) == 1
    assert "ya existe" in data["skipped"][0]["reason"].lower()
    assert storage.objects == []


async def test_import_zip_continues_after_storage_failure(import_client, session):
    client, _ = import_client
    await register_and_login(client, admin=True, session=session)
    _, album = await _create_album(client)

    storage = FailingStorage(fail_on_call=2)

    def failing_override() -> ZipImportService:
        songs_repo = SongRepository(session)
        albums_repo = AlbumRepository(session)
        artists_repo = ArtistRepository(session)
        return ZipImportService(
            songs_repository=songs_repo,
            albums_repository=albums_repo,
            song_service=SongService(songs_repo, artists_repo, albums_repo),
            storage=storage,
        )

    app.dependency_overrides[get_zip_import_service] = failing_override
    try:
        resp = await client.post(
            f"/albums/{album['id']}/import-zip",
            files={
                "file": (
                    "album.zip",
                    _zip_bytes(
                        {
                            "a.mp3": _mp3_bytes("A"),
                            "b.mp3": _mp3_bytes("B"),
                            "c.mp3": _mp3_bytes("C"),
                        }
                    ),
                    "application/zip",
                )
            },
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert [s["title"] for s in data["imported"]] == ["A", "C"]
        assert len(data["failed"]) == 1
        assert len(storage.objects) == 2
    finally:
        app.dependency_overrides.pop(get_zip_import_service, None)