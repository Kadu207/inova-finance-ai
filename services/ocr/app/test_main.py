import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health():
    assert client.get("/health").json()["status"] == "ok"


def test_ocr_job_requires_tenant():
    response = client.post("/jobs?document_type=boleto", files={"file": ("test.pdf", b"x" * 200)})
    assert response.status_code == 422


def test_ocr_job_success():
    response = client.post(
        "/jobs?document_type=boleto",
        files={"file": ("boleto.pdf", b"x" * 200, "application/pdf")},
        headers={"X-Tenant-Id": "tenant_test", "X-Correlation-Id": "corr_test"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["confidence"] >= 0.95
    assert data["status"] == "completed"
