import { Hono } from "hono";
import type { Env } from "../types";

export const healthRoutes = new Hono<{ Bindings: Env }>();

healthRoutes.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "inova-app-api",
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
  }),
);
