"""Authentication helpers for the Shastra Compute API.

Two mechanisms are supported:

1. **API Key** -- the Convex backend passes ``X-API-Key`` on every request.
   Validated via constant-time comparison against ``settings.api_key``.

2. **Stream Token** -- short-lived HMAC-signed tokens for SSE streaming
   endpoints.  The Convex backend mints these; the compute service verifies
   them.  Token format: ``base64(json_payload).hex_signature``.
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

        Bearer <base64(json_payload)>.<hex_signature>

    Payload schema::

        {
            "sessionId": str,
            "userId": str | null,
            "queriedAt": int,   # unix epoch seconds
            "exp": int          # unix epoch seconds
        }

    The signature is HMAC-SHA256 over the raw base64 segment, keyed by
    ``settings.stream_token_secret``.  Tokens are valid for 60 seconds.

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

    payload_b64, provided_sig = parts

    # Verify HMAC signature
    expected_sig = hmac.new(
        settings.stream_token_secret.encode(),
        payload_b64.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(provided_sig, expected_sig):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid stream token signature",
        )

    # Decode payload
    try:
        payload_bytes = base64.b64decode(payload_b64)
        payload: dict = json.loads(payload_bytes)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not decode stream token payload",
        )

    # Check expiry (60 second window)
    exp = payload.get("exp")
    if exp is None or time.time() > exp:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Stream token expired",
        )

    return payload


# Dependency aliases for use in route signatures
ApiKeyAuth = Annotated[bool, Depends(verify_api_key)]
StreamTokenAuth = Annotated[dict, Depends(verify_stream_token)]
