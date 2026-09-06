"""Planetary Computer helpers: STAC item retrieval + SAS signing."""

import logging
import threading
import time
from typing import Any, Dict, Optional, Tuple

import requests

from ..config import (
    HTTP_CONNECT_TIMEOUT_S,
    HTTP_READ_TIMEOUT_S,
    SAS_TOKEN_URL,
    STAC_URL,
)

logger = logging.getLogger("orbitalquery.planetary")

_sas_lock = threading.Lock()
_sas_cache: Dict[str, Tuple[str, float]] = {}
_SAS_TTL_S = 45 * 60  # tokens last ~1h; refresh early


def _timeout() -> Tuple[float, float]:
    return (HTTP_CONNECT_TIMEOUT_S, HTTP_READ_TIMEOUT_S)


def fetch_item(collection: str, item_id: str) -> Dict[str, Any]:
    """Fetch a STAC item by id. Raises ValueError for 4xx, RuntimeError for
    network problems."""
    url = f"{STAC_URL}/collections/{collection}/items/{item_id}"
    try:
        resp = requests.get(url, timeout=_timeout())
    except requests.RequestException as exc:
        raise RuntimeError(f"STAC unreachable: {exc}") from exc
    if resp.status_code == 404:
        raise ValueError(f"Scene '{item_id}' not found in collection '{collection}'")
    if resp.status_code >= 400:
        raise ValueError(f"STAC returned {resp.status_code} for scene '{item_id}'")
    return resp.json()


def get_sas_token(collection: str) -> str:
    """Return a cached SAS query token for the collection (starts with '?').

    Retries with backoff on 429/5xx — the token endpoint rate-limits bursts,
    which happens on Cloud Run scale-ups."""
    now = time.time()
    with _sas_lock:
        cached = _sas_cache.get(collection)
        if cached and cached[1] > now:
            return cached[0]

    last_exc: Optional[Exception] = None
    for attempt in range(4):
        delay = 2.0 * (2 ** attempt)  # 2s, 4s, 8s
        try:
            resp = requests.get(SAS_TOKEN_URL.format(collection=collection), timeout=_timeout())
            if resp.status_code == 429 or resp.status_code >= 500:
                last_exc = RuntimeError(f"SAS endpoint returned {resp.status_code}")
                logger.warning("SAS token attempt %d failed: %s; backing off %.0fs",
                               attempt + 1, resp.status_code, delay)
                time.sleep(delay)
                continue
            resp.raise_for_status()
            token = resp.json().get("token")
            break
        except requests.RequestException as exc:
            last_exc = exc
            logger.warning("SAS token attempt %d failed: %s", attempt + 1, exc)
            time.sleep(delay)
    else:
        raise RuntimeError(f"could not obtain SAS token after retries: {last_exc}")

    if not token:
        raise RuntimeError("SAS endpoint returned no token")
    if not token.startswith("?"):
        token = "?" + token
    with _sas_lock:
        _sas_cache[collection] = (token, now + _SAS_TTL_S)
    return token


def signed_href(collection: str, href: str) -> str:
    """Append a SAS token to a blob URL. Public URLs pass through unchanged."""
    if "blob.core.windows.net" not in href or "sig=" in href:
        return href
    return href + get_sas_token(collection)
