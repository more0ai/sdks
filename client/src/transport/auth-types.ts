/**
 * NATS authentication types for multi-sandbox connection management.
 *
 * These types define the contract for obtaining credentials to connect
 * to remote NATS servers (sandboxes). The auth provider is called lazily
 * when the client needs to connect to a NATS server that is not the default.
 *
 * @see Docs/registry/15_Federated_Resolution_And_Multi_NATS_Implementation_Plan.md §3
 */

// ── Credentials ─────────────────────────────────────────────────────

/**
 * Credentials for authenticating to a NATS server.
 * Supports multiple NATS auth mechanisms.
 */
export interface NatsCredentials {
  /** NATS auth token (if token-based auth) */
  token?: string;
  /** Client ID / username (if user+pass auth) */
  user?: string;
  /** Client secret / password (if user+pass auth) */
  pass?: string;
  /** JWT (if NATS JWT auth) */
  jwt?: string;
  /** NKey seed (if NATS JWT auth) */
  nkeySeed?: string;
  /** When these credentials expire (Unix ms). Undefined = no expiry. */
  expiresAt?: number;
}

// ── Auth Provider ───────────────────────────────────────────────────

/**
 * Parameters passed to the auth provider when requesting credentials.
 */
export interface NatsAuthProviderParams {
  /** The NATS server URL that credentials are needed for */
  natsUrl: string;
  /** The user's current access token (for auth server calls) */
  accessToken?: string;
}

/**
 * Callback for obtaining NATS credentials for a sandbox server.
 *
 * Called by the connection pool when it needs to connect to a NATS server
 * that is not the default. The consumer wires this to their auth server
 * integration (e.g., calling the auth server's sandbox credential endpoint).
 *
 * @param params - The NATS URL and optional access token
 * @returns Credentials for connecting to the NATS server
 * @throws If credentials cannot be obtained (auth denied, server error, etc.)
 */
export type NatsAuthProvider = (params: NatsAuthProviderParams) => Promise<NatsCredentials>;
