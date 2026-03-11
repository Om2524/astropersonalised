FROM python:3.13-slim

# Install uv and gcc (needed for pyswisseph)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libc6-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy source and install with uv
COPY pyproject.toml .
COPY src/ src/
RUN uv pip install --system --no-cache .

# Expose the default uvicorn port
EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
