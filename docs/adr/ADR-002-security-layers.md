# Security Layers — Agent 19

## Cloudflare Edge

- WAF managed rules (configure in dashboard)
- Bot Fight Mode
- Turnstile on `/login` (integrate post-layout)
- Rate limiting: 100 req/min per tenant on `/api/*`

## Worker App

- JWT HS256, 1h expiry
- Refresh token rotation (TODO post-MVP)
- RBAC policy engine (`rbac.ts`)
- MFA TOTP for admin/owner roles
- CORS restricted to production domain + localhost

## Headers

- CSP: `default-src 'self'` (tighten post-layout)
- HSTS via Cloudflare SSL settings

## VPS

- CF Tunnel — no public ports except 443
- Webhook HMAC verification (`X-Signature`)

## Secrets Rotation

- JWT_SECRET: rotate quarterly via wrangler secret
- VPS_WEBHOOK_SECRET: rotate with dual-key grace period

## Observability (Agent 21)

- Structured JSON logs with `correlationId`, `tenantId`
- CF Observability `head_sampling_rate: 1` in dev, 0.1 in prod
- VPS: Grafana + Prometheus + Loki (docker-compose extension)
