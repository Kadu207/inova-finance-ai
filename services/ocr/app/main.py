from fastapi import FastAPI, Header, HTTPException, UploadFile, File
from pydantic import BaseModel
import uuid

app = FastAPI(title="Inova OCR Service", version="0.1.0")

SUPPORTED_TYPES = {"boleto", "contract", "invoice"}


class OcrJobResponse(BaseModel):
    job_id: str
    status: str
    document_type: str
    confidence: float | None = None
    result: dict | None = None


@app.get("/health")
def health():
    return {"status": "ok", "service": "ocr"}


@app.post("/jobs", response_model=OcrJobResponse)
async def create_job(
    document_type: str,
    file: UploadFile = File(...),
    x_tenant_id: str = Header(..., alias="X-Tenant-Id"),
    x_correlation_id: str = Header(default_factory=lambda: str(uuid.uuid4()), alias="X-Correlation-Id"),
):
    if document_type not in SUPPORTED_TYPES:
        raise HTTPException(400, f"Tipo não suportado. Use: {SUPPORTED_TYPES}")
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(400, "Arquivo vazio")

    job_id = str(uuid.uuid4())
    # MVP stub: simulate OCR extraction
    confidence = 0.96 if len(content) > 100 else 0.75
    result = {
        "tenant_id": x_tenant_id,
        "correlation_id": x_correlation_id,
        "filename": file.filename,
        "fields": {"amount": "1500.00", "due_date": "2026-07-15", "barcode": "23790..."},
    }
    return OcrJobResponse(
        job_id=job_id,
        status="completed",
        document_type=document_type,
        confidence=confidence,
        result=result,
    )


@app.get("/jobs/{job_id}", response_model=OcrJobResponse)
def get_job(job_id: str, x_tenant_id: str = Header(..., alias="X-Tenant-Id")):
    return OcrJobResponse(
        job_id=job_id,
        status="completed",
        document_type="boleto",
        confidence=0.96,
        result={"tenant_id": x_tenant_id},
    )
