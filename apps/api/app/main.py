from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.charts import router as charts_router
from app.routers.readings import router as readings_router
from app.routers.briefs import router as briefs_router
from app.routers.saved_readings import router as saved_readings_router
from app.routers.resonance import router as resonance_router

app = FastAPI(title="Shastra API", version="0.1.0")
app.include_router(charts_router)
app.include_router(readings_router)
app.include_router(briefs_router)
app.include_router(saved_readings_router)
app.include_router(resonance_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root() -> dict[str, str]:
    return {"app": "Shastra API", "version": "0.1.0"}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
