# Portas — Inova Finance AI (range INA)

Bloco dedicado para **não conflitar** com outros projetos locais (3000, 5432, 6379, 8787, etc.).

| Serviço | Porta | Variável |
|---------|-------|----------|
| Next.js (web) | **3100** | `INA_PORTS.web` |
| Chatwoot | **3101** | `INA_PORTS.chatwoot` |
| PostgreSQL | **5442** | `INA_PORTS.postgres` |
| Redis | **6381** | `INA_PORTS.redis` |
| N8N | **5680** | `INA_PORTS.n8n` |
| Qdrant | **6340** | `INA_PORTS.qdrant` |
| MinIO API | **9010** | `INA_PORTS.minioApi` |
| MinIO Console | **9011** | `INA_PORTS.minioConsole` |
| App API (Worker/BFF) | **8810** | `INA_PORTS.appApi` |
| Messaging Worker | **8811** | `INA_PORTS.messaging` |
| Agents Runtime | **8812** | `INA_PORTS.agentsRuntime` |
| Embedded Runtime | **8813** | `INA_PORTS.embeddedRuntime` |
| Bridges API (VPS) | **8814** | `INA_PORTS.bridgesApi` |
| OCR API | **8815** | `INA_PORTS.ocrApi` |
| Fiscal API | **8816** | `INA_PORTS.fiscalApi` |
| Reporting API | **8817** | `INA_PORTS.reportingApi` |

Fonte única: [`packages/config/ports.json`](../packages/config/ports.json)

## Dev local

```bash
pnpm --filter @inova/app-api dev   # :8810
pnpm --filter @inova/web dev       # :3100 (proxy /api/proxy → 8810)
```

## Docker

```bash
cd infra/hetzner && docker compose up -d
```
