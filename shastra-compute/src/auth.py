"""Authentication helpers for the Shastra Compute API.

Two mechanisms are supported:

1. **API Key** -- the Convex backend passes ``X-API-Key`` on every request.
   Validated via constant-time comparison against ``settings.api_key``.

2. **Stream Token** -- short-lived HMAC-signed tokens for SSE streaming
   endpoints.  The Convex backend mints these; the compute service verifies
   them.  Token format: ``base64url(json_payload).base64url(hmac_signature)``.

   The Convex ``authorizeStream`` action:
   - Signs the **raw JSON payload string** with HMAC-SHA256
   - Encodes both payload and signature as **base64url** (RFC 4648 §5)
   - Timestamps (``queriedAt``, ``exp``) are in **milliseconds** (JS Date.now())
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from src.config import settings


def _base64url_decode(s: str) -> bytes:
    """Decode a base64url string (RFC 4648 §5) to bytes.

    Handles missing padding and the URL-safe alphabet (``-`` and ``_``
    instead of ``+`` and ``/``).
    """
    # Add padding if needed
    s += "=" * (-len(s) % 4)
    # Convert base64url to standard base64
    s = s.replace("-", "+").replace("_", "/")
    return base64.b64decode(s)


async def verify_api_key(
    x_api_key: str = Header(..., alias="X-API-Key"),
) -> bool:
    """Validate the ``X-API-Key`` header against the configured secret.

    Returns ``True`` on success; raises 401 otherwise.
    """
    if not settings.api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server API key not configured",
        )
    if not hmac.compare_digest(x_api_key, settings.api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )
    return True


async def verify_stream_token(
    authorization: str = Header(...),
) -> dict:
    """Validate an HMAC-signed Bearer token for streaming endpoints.

    Expected header value::

        Bearer <base64url(json_payload)>.<base64url(hmac_sha256_signature)>

    The Convex ``authorizeStream`` action signs the **raw JSON payload
    string** (before base64url encoding) with HMAC-SHA256, then encodes
    both payload and signature as base64url.

    Payload schema::

        {
            "sessionId": str,
            "userId": str | null,
            "queriedAt": int,   # milliseconds (JS Date.now())
            "exp": int          # milliseconds (JS Date.now() + 60_000)
        }

    Returns the decoded payload dict on success; raises 401 otherwise.
    """
    if not settings.stream_token_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Stream token secret not configured",
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header must use Bearer scheme",
        )

    token = authorization[len("Bearer ") :]
    parts = token.split(".")
    if len(parts) != 2:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed stream token",
        )

    payload_b64url, sig_b64url = parts

    # 1. Decode the base64url payload to get the raw JSON string
    #    (this is what Convex signed with HMAC-SHA256)
    try:
        payload_bytes = _base64url_decode(payload_b64url)
        payload_json = payload_bytes.decode("utf-8")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not decode stream token payload",
        )

    # 2. Compute expected HMAC-SHA256 over the raw JSON string
    expected_sig = hmac.new(
        settings.stream_token_secret.encode(),
        payload_json.encode("utf-8"),
        hashlib.sha256,
    ).digest()

    # 3. Decode the provided signature from base64url
    try:
        provided_sig = _base64url_decode(sig_b64url)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not decode stream token signature",
        )

    # 4. Constant-time comparison of signature bytes
    if not hmac.compare_digest(expected_sig, provided_sig):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid stream token signature",
        )

    # 5. Parse the JSON payload
    try:
        payload: dict = json.loads(payload_json)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not parse stream token payload",
        )

    # 6. Check expiry — Convex timestamps are in MILLISECONDS
    exp = payload.get("exp")
    now_ms = time.time() * 1000
    if exp is None or now_ms > exp:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Stream token expired",
        )

    return payload


# Dependency aliases for use in route signatures
ApiKeyAuth = Annotated[bool, Depends(verify_api_key)]
StreamTokenAuth = Annotated[dict, Depends(verify_stream_token)]
