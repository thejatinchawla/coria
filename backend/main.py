import os

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agent import invoke_agent
from db import get_supabase
from memory.embed import backfill_channel_memory, embed_message_by_id

load_dotenv()


def validate_env() -> None:
    """Fail fast at startup if required configuration is missing, rather than
    surfacing a confusing error on the first request."""
    provider = os.getenv("LLM_PROVIDER", "")
    required = {
        "SUPABASE_URL": os.getenv("SUPABASE_URL"),
        "SUPABASE_SERVICE_KEY": os.getenv("SUPABASE_SERVICE_KEY"),
        "LLM_PROVIDER": provider,
        "LLM_MODEL": os.getenv("LLM_MODEL"),
    }
    if provider == "anthropic":
        required["ANTHROPIC_API_KEY"] = os.getenv("ANTHROPIC_API_KEY")
    elif provider == "groq":
        required["GROQ_API_KEY"] = os.getenv("GROQ_API_KEY")

    missing = [
        name for name, value in required.items() if not value or not value.strip()
    ]
    if missing:
        raise RuntimeError(
            "Missing required environment variables: " + ", ".join(missing)
        )


def cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "http://localhost:3000")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


validate_env()

app = FastAPI(title="Coria Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

INVOKE_SECRET = os.getenv("INVOKE_SECRET", "").strip()


class InvokeRequest(BaseModel):
    user_message: str
    channel_id: str
    agent_id: str


class EmbedMessageRequest(BaseModel):
    message_id: str


class BackfillChannelRequest(BaseModel):
    channel_id: str


def verify_invoke_secret(x_invoke_secret: str | None) -> None:
    if not INVOKE_SECRET:
        return
    if x_invoke_secret != INVOKE_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
async def health():
    """Liveness plus a trivial DB round-trip, so a misconfigured Supabase env
    surfaces here instead of on the first /invoke."""
    try:
        supabase = get_supabase()
        supabase.table("messages").select("id").limit(1).execute()
        return {"status": "ok", "db": "ok"}
    except Exception as e:
        return {"status": "degraded", "db": "error", "detail": str(e)}


@app.post("/invoke")
async def invoke(
    req: InvokeRequest,
    background_tasks: BackgroundTasks,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    background_tasks.add_task(
        invoke_agent,
        req.user_message,
        req.channel_id,
        req.agent_id,
    )
    return {"status": "accepted"}


@app.post("/memory/embed")
async def memory_embed(
    req: EmbedMessageRequest,
    background_tasks: BackgroundTasks,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    background_tasks.add_task(embed_message_by_id, req.message_id)
    return {"status": "accepted"}


@app.post("/memory/backfill")
async def memory_backfill(
    req: BackfillChannelRequest,
    background_tasks: BackgroundTasks,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    background_tasks.add_task(backfill_channel_memory, req.channel_id)
    return {"status": "accepted"}
