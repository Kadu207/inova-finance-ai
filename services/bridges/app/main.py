"""VPS bridges for N8N and Chatwoot — complements Worker Messaging."""

from fastapi import FastAPI, Header, HTTPException, Request
import hmac
import hashlib
import base64
import os
from pydantic import BaseModel

app = FastAPI(title="Inova Integration Bridges", version="0.1.0")
WEBHOOK_SECRET = os.getenv("VPS_WEBHOOK_SECRET", "dev-secret-change-me")
CHATWOOT_LINKS: dict[str, dict] = {}


class ChatwootWebhook(BaseModel):
    event: str
    id: int
    content: str | None = None
    conversation: dict | None = None
    inbox: dict | None = None


@app.get("/health")
def health():
    return {"status": "ok", "service": "bridges"}


@app.post("/vps/events")
async def receive_event(
    request: Request,
    x_signature: str = Header(..., alias="X-Signature"),
    x_tenant_id: str = Header(..., alias="X-Tenant-Id"),
):
    body = await request.body()
    expected = base64.b64encode(hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).digest()).decode()
    if not hmac.compare_digest(expected, x_signature):
        raise HTTPException(401, "Invalid signature")
    return {"received": True, "tenant_id": x_tenant_id}


@app.post("/n8n/trigger/{workflow_id}")
async def trigger_workflow(
    workflow_id: str,
    request: Request,
    x_tenant_id: str = Header(..., alias="X-Tenant-Id"),
    x_idempotency_key: str = Header(..., alias="X-Idempotency-Key"),
):
    payload = await request.json()
    return {
        "workflow_id": workflow_id,
        "tenant_id": x_tenant_id,
        "idempotency_key": x_idempotency_key,
        "triggered": True,
        "payload": payload,
    }


@app.post("/chatwoot/webhook")
async def chatwoot_webhook(
    payload: ChatwootWebhook,
    x_tenant_id: str = Header(..., alias="X-Tenant-Id"),
    x_idempotency_key: str = Header(default="auto", alias="X-Idempotency-Key"),
):
    if payload.event != "message_created":
        return {"skipped": True}
    conv_id = str(payload.conversation.get("id") if payload.conversation else "")
    CHATWOOT_LINKS[conv_id] = {"tenant_id": x_tenant_id, "conversation_id": conv_id}
    return {"received": True, "conversation_id": conv_id, "idempotency_key": x_idempotency_key}
