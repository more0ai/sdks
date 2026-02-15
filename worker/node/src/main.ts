/**
 * Capabilities worker process: sandboxes, worker pools, and workers.
 * Loads config, connects to comms, subscribes per pool (subject + consumer group),
 * and handles capability invocations. Supports hot reload via SIGHUP.
 */

import "dotenv/config";
import { createNodeJSLogger } from "./logger.js";
import { loadConfig } from "./config.js";
import { WorkerPoolManager } from "./worker-pool.js";

const SERVICE_NAME = "capabilities-worker";

async function main(): Promise<void> {
  const loggerFactory = createNodeJSLogger(SERVICE_NAME);
  const log = loggerFactory.get(`${SERVICE_NAME}:main`);

  let config = loadConfig({ log });
  const manager = new WorkerPoolManager({ config, log });

  await manager.start();
  log.info?.(
    {
      sandboxes: Object.keys(config.sandboxes).length,
      pools: config.workerPools.length,
    },
    `${SERVICE_NAME}:main - Started`
  );

  const shutdown = async (signal: string): Promise<void> => {
    log.info?.({ signal }, `${SERVICE_NAME}:main - Shutting down`);
    await manager.stop();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("SIGHUP", async () => {
    log.info?.({}, `${SERVICE_NAME}:main - Hot reload requested`);
    config = loadConfig({ log });
    await manager.reload(config);
    log.info?.({}, `${SERVICE_NAME}:main - Hot reload done`);
  });
}

main().catch((err) => {
  console.error(`${SERVICE_NAME}:main - Fatal:`, err);
  process.exit(1);
});
