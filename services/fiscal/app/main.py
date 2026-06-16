from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Inova Fiscal Service", version="0.1.0")


class NfeRequest(BaseModel):
    xml_content: str
    tenant_cnpj: str


@app.get("/health")
def health():
    return {"status": "ok", "service": "fiscal"}


@app.post("/nfe/parse")
def parse_nfe(payload: NfeRequest, x_tenant_id: str = Header(..., alias="X-Tenant-Id")):
    if not payload.xml_content.strip():
        raise HTTPException(400, "XML vazio")
    return {
        "tenant_id": x_tenant_id,
        "document_type": "nfe",
        "parsed": True,
        "fields": {"number": "12345", "total": "2500.00", "issuer_cnpj": payload.tenant_cnpj},
    }


@app.post("/sped/export")
def export_sped(
    period: str,
    x_tenant_id: str = Header(..., alias="X-Tenant-Id"),
):
    return {"tenant_id": x_tenant_id, "period": period, "status": "queued", "job_id": "sped-stub-001"}
