/**
 * Capabilities worker configuration: sandboxes and worker pools.
 */

import { readFileSync, existsSync } from "node:fs";

const LOG_PREFIX = "capabilities-worker:config";

/**
 * Sandbox: runtime environment for workers (e.g. env vars passed into capability execution).
 * The user creates a sandbox and then assigns worker pools to run within it.
 */
export interface Sandbox {
  /** Unique id for this sandbox */
  id: string;
  /** Human-readable name */
  name?: string;
  /** Environment variables available to capability handlers in this sandbox */
  env: Record<string, string>;
}

/**
 * Worker pool: a set of concurrent workers that support specific capabilities.
 * All workers in the pool join the same consumer group so each message is
 * delivered to exactly one worker.
 */
export interface WorkerPoolConfig {
  /** Unique id for this pool */
  id: string;
  /** Human-readable name */
  name?: string;
  /** Sandbox id this pool runs in (env vars applied when handling messages) */
  sandboxId: string;
  /** Capability names this pool supports (resolved to subjects via bootstrap) */
  capabilities: string[];
  /** Number of concurrent workers in this pool */
  concurrentWorkers: number;
  /** Consumer group name (all workers in this pool join this group) */
  consumerGroup: string;
}

/**
 * Resolved capability: subject and consumer group for subscription.
 */
export interface ResolvedCapabilitySpec {
  capability: string;
  subject: string;
  consumerGroup: string;
}

/**
 * Top-level worker process configuration.
 */
export interface WorkerProcessConfig {
  /** Comms server URL */
  commsUrl: string;
  /** Connection name (for debugging) */
  connectionName: string;
  /** Path to bootstrap for resolving capability -> subject */
  bootstrapPath?: string;
  /** Sandboxes (id -> sandbox) */
  sandboxes: Record<string, Sandbox>;
  /** Worker pools */
  workerPools: WorkerPoolConfig[];
}

/**
 * Load config from environment and optional config file.
 * Env: COMMS_URL, SERVICE_NAME, BOOTSTRAP_PATH, CONFIG_PATH.
 * CONFIG_PATH can point to a JSON file with sandboxes and workerPools.
 */
export function loadConfig(params: { log?: any }): WorkerProcessConfig {
  const log = params.log ?? console;
  const commsUrl = process.env.COMMS_URL ?? "nats://127.0.0.1:4222";
  const connectionName = process.env.SERVICE_NAME ?? "capabilities-worker";
  const bootstrapPath = process.env.BOOTSTRAP_PATH ?? process.env.REGISTRY_BOOTSTRAP_FILE;
  const configPath = process.env.CONFIG_PATH;

  let sandboxes: Record<string, Sandbox> = {};
  let workerPools: WorkerPoolConfig[] = [];

  if (configPath) {
    try {
      if (existsSync(configPath)) {
        const content = readFileSync(configPath, "utf-8");
        const data = JSON.parse(content) as {
          sandboxes?: Sandbox[] | Record<string, Sandbox>;
          workerPools?: WorkerPoolConfig[];
        };
        if (data.sandboxes) {
          if (Array.isArray(data.sandboxes)) {
            sandboxes = Object.fromEntries(
              data.sandboxes.map((s) => [s.id, s])
            );
          } else {
            sandboxes = data.sandboxes;
          }
        }
        if (data.workerPools) {
          workerPools = data.workerPools;
        }
        log.info?.(
          { configPath, sandboxCount: Object.keys(sandboxes).length, poolCount: workerPools.length },
          `${LOG_PREFIX}:loadConfig - Loaded config from file`
        );
      } else {
        log.warn?.({ configPath }, `${LOG_PREFIX}:loadConfig - Config file not found`);
      }
    } catch (err: any) {
      log.error?.(
        { configPath, error: err?.message },
        `${LOG_PREFIX}:loadConfig - Failed to load config file`
      );
    }
  }

  return {
    commsUrl,
    connectionName,
    bootstrapPath,
    sandboxes,
    workerPools,
  };
}
