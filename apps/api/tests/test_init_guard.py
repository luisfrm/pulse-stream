"""Tests del guard de `/init` (loopback/local o INIT_TOKEN)."""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.core.config import Environment
from app.features.users import init_guard


def _request(
    host: str = "127.0.0.1",
    *,
    headers: dict[str, str] | None = None,
) -> Request:
    raw_headers = [
        (key.lower().encode("latin-1"), value.encode("latin-1"))
        for key, value in (headers or {}).items()
    ]
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/init",
        "raw_path": b"/init",
        "query_string": b"",
        "headers": raw_headers,
        "client": (host, 12345),
        "server": ("testserver", 80),
    }
    return Request(scope)


def _settings(*, env: Environment, token: str | None = None) -> SimpleNamespace:
    return SimpleNamespace(env=env, init_token=token)


def test_local_loopback_allowed(monkeypatch):
    monkeypatch.setattr(
        init_guard, "settings", _settings(env=Environment.LOCAL)
    )
    # No lanza
    init_guard.require_init_allowed(_request("127.0.0.1"))
    init_guard.require_init_allowed(_request("::1"))


def test_local_non_loopback_denied(monkeypatch):
    monkeypatch.setattr(
        init_guard, "settings", _settings(env=Environment.LOCAL)
    )
    with pytest.raises(HTTPException) as exc:
        init_guard.require_init_allowed(_request("10.0.0.5"))
    assert exc.value.status_code == 403


def test_non_local_without_token_denied(monkeypatch):
    monkeypatch.setattr(
        init_guard, "settings", _settings(env=Environment.PROD)
    )
    with pytest.raises(HTTPException) as exc:
        init_guard.require_init_allowed(_request("127.0.0.1"))
    assert exc.value.status_code == 403


def test_token_required_when_configured(monkeypatch):
    monkeypatch.setattr(
        init_guard, "settings", _settings(env=Environment.LOCAL, token="s3cret")
    )

    with pytest.raises(HTTPException) as missing:
        init_guard.require_init_allowed(_request("127.0.0.1"))
    assert missing.value.status_code == 403

    with pytest.raises(HTTPException) as wrong:
        init_guard.require_init_allowed(
            _request("127.0.0.1", headers={"X-Init-Token": "nope"})
        )
    assert wrong.value.status_code == 403


def test_token_allows_non_local(monkeypatch):
    monkeypatch.setattr(
        init_guard, "settings", _settings(env=Environment.PROD, token="s3cret")
    )
    init_guard.require_init_allowed(
        _request("203.0.113.9", headers={"X-Init-Token": "s3cret"})
    )
