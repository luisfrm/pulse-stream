"""Unitarios del probe de audio (`_probe_audio`), sin DB.

Los bytes de los M4A son 1:1 con los builders del Worker
(`apps/api-worker/src/lib/__fixtures__/mp4.ts`, usados por
`src/lib/audio.test.ts`): `ftyp` / `free`, `moov` con `mvhd` + `trak`, `hdlr`
con el handler en los bytes 8..12 del payload y `mvhd`/`mdhd` v0 con timescale
en +12 y duration en +16. No hay módulo compartido entre Python y TS: si
cambia un builder acá, cambiarlo también allá.

Cubre la paridad con mutagen (y con el probe del Worker): un MP4 sin pista de
audio no es un M4A, la duración sale del `mdhd` del track `soun` (no del
`mvhd`), un `mdhd` en 0 es válido pero sin duración, `ftyp` no tiene que ser la
primera caja y el redondeo es half-to-even (como `round()` de Python).
"""

import struct

import pytest

from app.features.uploads.service import _probe_audio


def _box(name: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", 8 + len(payload)) + name + payload


def _ftyp() -> bytes:
    return _box(b"ftyp", b"M4A " + b"\x00\x00\x00\x00" + b"M4A " + b"mp42")


def _free(size: int = 8) -> bytes:
    """Caja `free` de `size` bytes en total (relleno válido del contenedor)."""
    return _box(b"free", b"\x00" * (size - 8))


def _time_header(name: bytes, seconds: float, timescale: int = 1000) -> bytes:
    # Full atom v0: version+flags (4), creation (4), modification (4),
    # timescale (4), duration (4) y el resto en ceros.
    payload = bytearray(24)
    struct.pack_into(">I", payload, 12, timescale)
    struct.pack_into(">I", payload, 16, int(seconds * timescale))
    return _box(name, bytes(payload))


def _mvhd(seconds: float) -> bytes:
    return _time_header(b"mvhd", seconds)


def _mdhd(seconds: float) -> bytes:
    return _time_header(b"mdhd", seconds)


def _hdlr(handler: bytes) -> bytes:
    # version+flags (4) + pre_defined (4) + handler type (4) + reservado.
    payload = bytearray(24)
    payload[8:12] = handler
    return _box(b"hdlr", bytes(payload))


def _trak(handler: bytes, mdhd: bytes | None) -> bytes:
    """`trak/mdia` con el `hdlr` pedido y el `mdhd` (omitido si es None)."""
    return _box(b"trak", _box(b"mdia", _hdlr(handler) + (mdhd or b"")))


def _moov(*children: bytes) -> bytes:
    return _box(b"moov", b"".join(children))


def _m4a(seconds: float = 2) -> bytes:
    """M4A completo: `ftyp` + `moov(mvhd + trak soun)`."""
    return _ftyp() + _moov(_mvhd(seconds), _trak(b"soun", _mdhd(seconds)))


@pytest.mark.parametrize(
    ("data", "recognized", "duration"),
    [
        pytest.param(_m4a(3), True, 3, id="m4a-con-track-soun"),
        pytest.param(
            _ftyp() + _moov(_mvhd(3), _trak(b"vide", _mdhd(3))),
            False,
            None,
            id="solo-track-vide-sin-pista-de-audio",
        ),
        pytest.param(
            _ftyp() + _moov(_mvhd(3)),
            False,
            None,
            id="sin-ningun-track",
        ),
        pytest.param(
            _ftyp() + _moov(_trak(b"soun", _mdhd(2))),
            True,
            2,
            id="sin-mvhd-pero-con-soun",
        ),
        pytest.param(
            _ftyp() + _moov(_mvhd(3), _trak(b"soun", _mdhd(0))),
            True,
            None,
            id="mdhd-duration-0",
        ),
        pytest.param(
            _free() + _moov(_mvhd(2), _trak(b"soun", _mdhd(2))),
            False,
            None,
            id="sin-ftyp",
        ),
        pytest.param(
            _free() + _ftyp() + _moov(_mvhd(2), _trak(b"soun", _mdhd(2))),
            True,
            2,
            id="free-antes-del-ftyp",
        ),
        pytest.param(
            _ftyp() + _moov(_mvhd(9), _trak(b"soun", _mdhd(2.5))),
            True,
            2,
            id="duracion-2.5-half-to-even",
        ),
        pytest.param(
            _ftyp() + _moov(_mvhd(1), _trak(b"soun", _mdhd(3.5))),
            True,
            4,
            id="duracion-3.5-half-to-even",
        ),
        pytest.param(b"this is not audio", False, None, id="bytes-basura"),
    ],
)
def test_probe_audio(data: bytes, recognized: bool, duration: int | None) -> None:
    assert _probe_audio(data) == (duration, recognized)
