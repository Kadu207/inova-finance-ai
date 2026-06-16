import app from "./app";
import type { Env } from "./types";

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
