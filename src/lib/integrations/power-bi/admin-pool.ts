/**
 * Pool dedicado para DDL administrativo do provisioner Power BI.
 *
 * - statement_timeout=30s setado no Pool config (todas queries com mesmo
 *   timeout sem precisar SET a cada call).
 * - max=3 conexões concorrentes (DDL não escala).
 * - Mesma DATABASE_URL do app, mas pool separado pra não competir com
 *   queries normais do Server Components.
 */

import { Pool } from "pg";

const globalForAdminPool = globalThis as unknown as {
  integrationAdminPool: Pool | undefined;
};

export function getIntegrationAdminPool(): Pool {
  if (globalForAdminPool.integrationAdminPool) return globalForAdminPool.integrationAdminPool;
  globalForAdminPool.integrationAdminPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    min: 0,
    max: 3,
    statement_timeout: 30_000,
    idleTimeoutMillis: 5_000,
    application_name: "nexus-insights-integrations-admin",
  });
  globalForAdminPool.integrationAdminPool.on("error", (err) => {
    console.error("[integrations-admin-pool] error:", err.message);
  });
  return globalForAdminPool.integrationAdminPool;
}
