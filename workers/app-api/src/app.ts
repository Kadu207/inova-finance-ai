import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { requireTenantContext } from "./middleware/tenant";
import { setRuntimeEnvironment } from "./db/client";
import { authRoutes } from "./routes/auth";
import { financeRoutes } from "./routes/finance";
import { healthRoutes } from "./routes/health";
import { integrationRoutes } from "./routes/integrations";
import { lgpdRoutes } from "./routes/lgpd";
import { assistantRoutes } from "./routes/assistant";
import { reconciliationRoutes } from "./routes/reconciliation";
import { chargesRoutes, pspWebhookRoutes } from "./routes/charges";
import { invoiceRoutes, nfseWebhookRoutes } from "./routes/invoices";
import { dreRoutes } from "./routes/dre";
import { recurrenceRoutes } from "./routes/recurrences";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({
  origin: [
    "https://inovafinanceai.inovatitech.com.br",
    "http://localhost:3100",
    "http://127.0.0.1:3100",
  ],
  allowHeaders: ["Content-Type", "Authorization", "X-Tenant-Id", "X-Branch-Id", "X-Correlation-Id", "X-Idempotency-Key"],
}));

// Registra o ambiente para a guarda de RLS (BYPASSRLS é fatal em produção). Antes das rotas.
app.use("*", async (c, next) => {
  setRuntimeEnvironment(c.env.ENVIRONMENT);
  await next();
});

app.route("/", healthRoutes);
app.route("/auth", authRoutes);
app.use("/api/*", requireTenantContext());
app.route("/api/finance", financeRoutes);
app.route("/api/dre", dreRoutes);
app.route("/api/recurrences", recurrenceRoutes);
app.route("/api/integrations", integrationRoutes);
app.route("/api/lgpd", lgpdRoutes);
app.route("/api/assistant", assistantRoutes);
app.route("/api/reconciliation", reconciliationRoutes);
app.route("/api/charges", chargesRoutes);
app.route("/api/invoices", invoiceRoutes);
app.route("/webhooks", pspWebhookRoutes);
app.route("/webhooks", nfseWebhookRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error(JSON.stringify({ level: "error", message: err.message, correlationId: c.req.header("X-Correlation-Id") }));
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
