/**
 * Worker pool: connects to comms, resolves pool capabilities to subjects,
 * creates one subscription per (subject, consumer group) per concurrent worker,
 * and runs the message handler for each message.
 */

import { connect, StringCodec, type NatsConnection, type Subscription } from "nats";
import type {
  WorkerProcessConfig,
  WorkerPoolConfig,
  Sandbox,
  ResolvedCapabilitySpec,
} from "./config.js";
import type { BootstrapConfig } from "./bootstrap.js";
import { loadBootstrap, getDefaultBootstrap, resolvePoolCapabilities } from "./bootstrap.js";
import { handleMessage } from "./worker.js";

const LOG_PREFIX = "capabilities-worker:worker-pool";
const sc = StringCodec();

export interface WorkerPoolManagerParams {
  config: WorkerProcessConfig;
  log?: any;
}

export class WorkerPoolManager {
  private config: WorkerProcessConfig;
  private log: any;
  private bootstrap: BootstrapConfig;
  private connection: NatsConnection | null = null;
  private subscriptions: Subscription[] = [];

  constructor(params: WorkerPoolManagerParams) {
    this.config = params.config;
    this.log = params.log ?? console;
    this.bootstrap =
      params.config.bootstrapPath &&
      loadBootstrap({ path: params.config.bootstrapPath, log: this.log }) != null
        ? loadBootstrap({ path: params.config.bootstrapPath!, log: this.log })!
        : getDefaultBootstrap();
  }

  /**
   * Connect to comms and start all worker pools (subscribe per subject with consumer group).
   */
  async start(): Promise<void> {
    this.log.info?.(
      { commsUrl: this.config.commsUrl, connectionName: this.config.connectionName },
      `${LOG_PREFIX}:start - Connecting`
    );
    this.connection = await connect({
      servers: this.config.commsUrl,
      name: this.config.connectionName,
    });
    this.log.info?.({}, `${LOG_PREFIX}:start - Connected`);

    for (const pool of this.config.workerPools) {
      await this.startPool(pool);
    }
  }

  /**
   * Start one pool: resolve capabilities, create concurrent workers (subscriptions).
   */
  private async startPool(pool: WorkerPoolConfig): Promise<void> {
    const sandbox = this.config.sandboxes[pool.sandboxId];
    if (!sandbox) {
      this.log.warn?.(
        { poolId: pool.id, sandboxId: pool.sandboxId },
        `${LOG_PREFIX}:startPool - Sandbox not found, skipping pool`
      );
      return;
    }

    const specs = resolvePoolCapabilities({
      bootstrap: this.bootstrap,
      pool,
      log: this.log,
    });
    if (specs.length === 0) {
      this.log.warn?.(
        { poolId: pool.id },
        `${LOG_PREFIX}:startPool - No capabilities resolved, skipping pool`
      );
      return;
    }

    this.log.info?.(
      {
        poolId: pool.id,
        sandboxId: pool.sandboxId,
        specs: specs.length,
        concurrentWorkers: pool.concurrentWorkers,
      },
      `${LOG_PREFIX}:startPool - Starting pool`
    );

    for (const spec of specs) {
      for (let w = 0; w < pool.concurrentWorkers; w++) {
        const sub = this.connection!.subscribe(spec.subject, {
          queue: spec.consumerGroup,
        });
        this.subscriptions.push(sub);
        this.runWorker(sub, spec, sandbox, pool.id);
      }
    }
  }

  /**
   * Run a single worker loop: consume messages, handle, reply.
   */
  private runWorker(
    sub: Subscription,
    spec: ResolvedCapabilitySpec,
    sandbox: Sandbox,
    poolId: string
  ): void {
    (async () => {
      for await (const msg of sub) {
        try {
          const response = await handleMessage({
            body: msg.data,
            sandbox,
            log: this.log,
          });
          if (msg.reply) {
            msg.respond(sc.encode(JSON.stringify(response)));
          }
        } catch (err: any) {
          this.log.error?.(
            { subject: spec.subject, capability: spec.capability, poolId, error: err?.message },
            `${LOG_PREFIX}:runWorker - Handle failed`
          );
          if (msg.reply) {
            msg.respond(
              sc.encode(
                JSON.stringify({
                  ok: false,
                  error: {
                    code: "INTERNAL_ERROR",
                    message: err?.message ?? "Worker error",
                    retryable: true,
                  },
                })
              )
            );
          }
        }
      }
    })().catch((err) => {
      this.log.error?.(
        { subject: spec.subject, poolId, error: err?.message },
        `${LOG_PREFIX}:runWorker - Worker loop error`
      );
    });
  }

  /**
   * Reload: drain current subscriptions, reload config and bootstrap, restart pools.
   */
  async reload(newConfig: WorkerProcessConfig): Promise<void> {
    this.log.info?.({}, `${LOG_PREFIX}:reload - Draining subscriptions`);
    for (const sub of this.subscriptions) {
      await sub.drain();
    }
    this.subscriptions = [];

    this.config = newConfig;
    if (newConfig.bootstrapPath) {
      const next = loadBootstrap({ path: newConfig.bootstrapPath, log: this.log });
      if (next) this.bootstrap = next;
    }

    for (const pool of this.config.workerPools) {
      await this.startPool(pool);
    }
    this.log.info?.({}, `${LOG_PREFIX}:reload - Reload complete`);
  }

  /**
   * Stop: drain subscriptions and close connection.
   */
  async stop(): Promise<void> {
    this.log.info?.({}, `${LOG_PREFIX}:stop - Stopping`);
    for (const sub of this.subscriptions) {
      await sub.drain();
    }
    this.subscriptions = [];
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
    this.log.info?.({}, `${LOG_PREFIX}:stop - Stopped`);
  }
}
