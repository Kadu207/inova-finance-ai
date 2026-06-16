from fastapi import FastAPI, Header

app = FastAPI(title="Inova Reporting Service", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok", "service": "reporting"}


@app.get("/reports/cash-flow")
def cash_flow_report(
    period: str = "2026-06",
    x_tenant_id: str = Header(..., alias="X-Tenant-Id"),
):
    return {
        "tenant_id": x_tenant_id,
        "period": period,
        "inflow": 50000.0,
        "outflow": 32000.0,
        "net": 18000.0,
    }


@app.get("/reports/ap-aging")
def ap_aging(x_tenant_id: str = Header(..., alias="X-Tenant-Id")):
    return {"tenant_id": x_tenant_id, "buckets": {"0-30": 10000, "31-60": 5000, "61+": 2000}}
