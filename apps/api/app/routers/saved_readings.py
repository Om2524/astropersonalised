"""Saved readings endpoints — save, list, toggle, and delete readings."""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.reading import SavedReading

router = APIRouter(prefix="/api/readings", tags=["saved-readings"])


# ── Pydantic schemas ──────────────────────────────────────────────────


class SaveReadingRequest(BaseModel):
    session_id: str
    query: str
    method_used: str
    domain: Optional[str] = None
    reading: dict
    evidence_summary: Optional[dict] = None
    classification: Optional[dict] = None
    confidence: Optional[float] = None


class SavedReadingResponse(BaseModel):
    id: uuid.UUID
    session_id: str
    query: str
    method_used: str
    domain: Optional[str] = None
    reading: dict
    evidence_summary: Optional[dict] = None
    classification: Optional[dict] = None
    confidence: Optional[float] = None
    is_saved: bool
    created_at: str

    model_config = {"from_attributes": True}


class ToggleSaveResponse(BaseModel):
    id: uuid.UUID
    is_saved: bool


# ── Endpoints ─────────────────────────────────────────────────────────


@router.post("/save", response_model=SavedReadingResponse)
async def save_reading(body: SaveReadingRequest, db: AsyncSession = Depends(get_db)):
    """Save a reading to the database."""
    row = SavedReading(
        session_id=body.session_id,
        query=body.query,
        method_used=body.method_used,
        domain=body.domain,
        reading=body.reading,
        evidence_summary=body.evidence_summary,
        classification=body.classification,
        confidence=body.confidence,
        is_saved=True,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return _to_response(row)


@router.get("/saved", response_model=list[SavedReadingResponse])
async def list_saved(
    session_id: str = Query(...),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List bookmarked readings for a session (is_saved=True), newest first."""
    stmt = (
        select(SavedReading)
        .where(SavedReading.session_id == session_id, SavedReading.is_saved.is_(True))
        .order_by(SavedReading.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [_to_response(r) for r in rows]


@router.get("/history", response_model=list[SavedReadingResponse])
async def list_history(
    session_id: str = Query(...),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List ALL readings for a session (saved or not), newest first."""
    stmt = (
        select(SavedReading)
        .where(SavedReading.session_id == session_id)
        .order_by(SavedReading.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [_to_response(r) for r in rows]


@router.patch("/{reading_id}/toggle-save", response_model=ToggleSaveResponse)
async def toggle_save(reading_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Toggle the is_saved flag on a reading."""
    row = await db.get(SavedReading, reading_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Reading not found")
    row.is_saved = not row.is_saved
    await db.flush()
    await db.refresh(row)
    return ToggleSaveResponse(id=row.id, is_saved=row.is_saved)


@router.delete("/{reading_id}", status_code=200)
async def delete_reading(reading_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Delete a reading permanently."""
    row = await db.get(SavedReading, reading_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Reading not found")
    await db.delete(row)
    await db.flush()
    return {"ok": True, "deleted": str(reading_id)}


# ── Helpers ───────────────────────────────────────────────────────────


def _to_response(row: SavedReading) -> SavedReadingResponse:
    return SavedReadingResponse(
        id=row.id,
        session_id=row.session_id,
        query=row.query,
        method_used=row.method_used,
        domain=row.domain,
        reading=row.reading,
        evidence_summary=row.evidence_summary,
        classification=row.classification,
        confidence=row.confidence,
        is_saved=row.is_saved,
        created_at=row.created_at.isoformat() if row.created_at else "",
    )
