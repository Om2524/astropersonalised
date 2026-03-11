"""add_saved_readings

Revision ID: d60d1f86d46b
Revises: 2f561cea8069
Create Date: 2026-03-09 12:41:22.188076

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'd60d1f86d46b'
down_revision: Union[str, Sequence[str], None] = '2f561cea8069'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "saved_readings",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("session_id", sa.String(255), nullable=False, index=True),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("method_used", sa.String(50), nullable=False),
        sa.Column("domain", sa.String(50), nullable=True),
        sa.Column("reading", JSONB(), nullable=False),
        sa.Column("evidence_summary", JSONB(), nullable=True),
        sa.Column("classification", JSONB(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("is_saved", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("saved_readings")
