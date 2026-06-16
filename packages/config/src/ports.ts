import ports from "../ports.json";

export const INA_PORTS = ports;

export const webUrl = (host = "localhost") => `http://${host}:${INA_PORTS.web}`;
export const appApiUrl = (host = "127.0.0.1") => `http://${host}:${INA_PORTS.appApi}`;
export const chatwootUrl = (host = "localhost") => `http://${host}:${INA_PORTS.chatwoot}`;
export const n8nUrl = (host = "localhost") => `http://${host}:${INA_PORTS.n8n}`;
export const postgresUrl = (password: string, host = "localhost") =>
  `postgresql://inova:${password}@${host}:${INA_PORTS.postgres}/inova_finance`;
