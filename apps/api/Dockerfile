FROM python:3.13-slim

WORKDIR /app

# System deps for pyswisseph (needs gcc + headers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libc6-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy astro-core package first (it's a local dependency)
COPY packages/astro-core /app/packages/astro-core

# Copy API project files
COPY apps/api/pyproject.toml apps/api/uv.lock /app/
COPY apps/api/app /app/app
COPY apps/api/alembic /app/alembic
COPY apps/api/alembic.ini /app/alembic.ini

# Install dependencies
RUN uv sync --frozen --no-dev 2>/dev/null || uv sync

# Add astro-core to Python path
ENV PYTHONPATH="/app/packages/astro-core:${PYTHONPATH}"

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
