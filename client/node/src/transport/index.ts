export { createNatsTransportCore, type NatsTransportConfig, defaultNatsTransportConfig } from "./nats-transport.js";
export { NatsConnectionPool, type ConnectionPoolConfig, type ConnectionPoolStats } from "./connection-pool.js";
export type { NatsCredentials, NatsAuthProvider, NatsAuthProviderParams } from "./auth-types.js";
export { createHttpNatsAuthProvider, type HttpNatsAuthProviderConfig } from "./auth-provider-http.js";
