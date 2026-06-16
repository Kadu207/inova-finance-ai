import { createServer } from "node:http";
import type { IncomingMessage, Server } from "node:http";
import app from "./app";
import { createLocalEnv } from "./local-env";
import { INA_PORTS } from "@inova/config";

const port = Number(process.env.PORT ?? INA_PORTS.appApi);
const env = createLocalEnv();

async function seedDemoAdmin(env: ReturnType<typeof createLocalEnv>) {
  const demoKey = "user:admin@inova.local";
  const existing = await env.SESSIONS.get(demoKey, "json");
  if (existing) return;

  const { hashPassword } = await import("./auth");
  await env.SESSIONS.put(
    demoKey,
    JSON.stringify({
      userId: "user_demo_admin",
      email: "admin@inova.local",
      passwordHash: await hashPassword("changeme"),
      role: "admin",
      mfaEnabled: false,
      branchIds: ["branch_main"],
    }),
  );
}

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function createAppServer(): Server {
  return createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? `127.0.0.1:${port}`;
      const url = `http://${host}${req.url ?? "/"}`;
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined) {
          headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
      }

      const request = new Request(url, {
        method: req.method,
        headers,
        body: await readBody(req),
      });

      const response = await app.fetch(request, env, {
        waitUntil: (promise) => void promise,
        passThroughOnException: () => {},
      });

      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      if (response.body) {
        const buffer = Buffer.from(await response.arrayBuffer());
        res.end(buffer);
      } else {
        res.end();
      }
    } catch (error) {
      console.error(error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  });
}

const server = createAppServer();

server.listen(port, "127.0.0.1", async () => {
  await seedDemoAdmin(env);
  console.log(`Inova App API http://127.0.0.1:${port} (INA port ${INA_PORTS.appApi})`);
  console.log(`Demo login: admin@inova.local / changeme`);
}).on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Porta INA ${port} em uso. Veja docs/PORTS.md — pare o processo ou use PORT=<outra>.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
