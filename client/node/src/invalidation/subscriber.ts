/**
 * Invalidation subscriber - listens for registry change events.
 * Absorbed from @morezero/registry-client.
 */

import type { NatsConnection, Subscription } from "nats";
import type { RegistryChangedEvent } from "../types/registry.js";

const SERVICE_NAME = "capabilities-client:invalidation";

export interface InvalidationSubscriberConfig {
  subjectPrefix: string;
  subscribeGranular: boolean;
  subscribeGlobal: boolean;
}

export const defaultInvalidationConfig: InvalidationSubscriberConfig = {
  subjectPrefix: "registry.changed",
  subscribeGranular: true,
  subscribeGlobal: true,
};

export type InvalidationHandler = (event: RegistryChangedEvent) => void;

export class InvalidationSubscriber {
  private config: InvalidationSubscriberConfig;
  private natsConnection?: NatsConnection;
  private subscriptions: Subscription[] = [];
  private handlers: InvalidationHandler[] = [];
  private log: any;
  private running = false;

  constructor(params: {
    config?: Partial<InvalidationSubscriberConfig>;
    loggerFactory?: any;
  }) {
    this.config = { ...defaultInvalidationConfig, ...params.config };
    this.log = params.loggerFactory?.get?.(SERVICE_NAME) ?? params.loggerFactory ?? console;
  }

  addHandler(handler: InvalidationHandler): void {
    this.handlers.push(handler);
  }

  removeHandler(handler: InvalidationHandler): void {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }

  async start(natsConnection: NatsConnection): Promise<void> {
    if (this.running) {
      this.log.warn?.({}, `${SERVICE_NAME}:start - Already running`);
      return;
    }

    this.natsConnection = natsConnection;
    this.running = true;

    if (this.config.subscribeGlobal) {
      const globalSub = natsConnection.subscribe(this.config.subjectPrefix);
      this.subscriptions.push(globalSub);
      this.processSubscription(globalSub, "global");
    }

    if (this.config.subscribeGranular) {
      const granularSubject = `${this.config.subjectPrefix}.*`;
      const granularSub = natsConnection.subscribe(granularSubject);
      this.subscriptions.push(granularSub);
      this.processSubscription(granularSub, "granular");
    }

    this.log.info?.(
      { subscribeGlobal: this.config.subscribeGlobal, subscribeGranular: this.config.subscribeGranular },
      `${SERVICE_NAME}:start - Subscribed to invalidation events`
    );
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions = [];
    this.log.info?.({}, `${SERVICE_NAME}:stop - Unsubscribed from invalidation events`);
  }

  get isRunning(): boolean {
    return this.running;
  }

  private async processSubscription(subscription: Subscription, type: string): Promise<void> {
    (async () => {
      for await (const msg of subscription) {
        if (!this.running) break;
        try {
          const data = JSON.parse(new TextDecoder().decode(msg.data)) as RegistryChangedEvent;
          this.log.debug?.({ type, event: data }, `${SERVICE_NAME}:processSubscription - Received event`);
          for (const handler of this.handlers) {
            try {
              handler(data);
            } catch (err) {
              this.log.error?.({ error: (err as Error).message }, `${SERVICE_NAME}:processSubscription - Handler error`);
            }
          }
        } catch (err) {
          this.log.error?.({ error: (err as Error).message }, `${SERVICE_NAME}:processSubscription - Failed to process message`);
        }
      }
    })();
  }
}
