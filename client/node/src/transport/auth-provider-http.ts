/**
 * HTTP-based NatsAuthProvider implementation.
 *
 * Calls the auth server's sandbox credential endpoint to obtain
 * NATS credentials for connecting to remote/sandbox NATS servers.
 *
 * This is a reference implementation. Consumers can provide their own
 * NatsAuthProvider that integrates with their auth infrastructure.
 *
 * @see Docs/registry/15_Federated_Resolution_And_Multi_NATS_Implementation_Plan.md §3
 */

import type { NatsAuthProvider, NatsCredentials, NatsAuthProviderParams } from "./auth-types.js";

const SERVICE_NAME = "capabilities-client:http-auth-provider";

function validateNatsCredentials(raw: unknown): NatsCredentials {
  if (raw === null || typeof raw !== "object") {
    throw new Error(`${SERVICE_NAME}:validate - Auth server response is not an object`);
  }
  const o = raw as Record<string, unknown>;
  const creds: NatsCredentials = {};
  if (o.token !== undefined) {
    if (typeof o.token !== "string") throw new Error(`${SERVICE_NAME}:validate - credentials.token must be string`);
    creds.token = o.token;
  }
  if (o.user !== undefined) {
    if (typeof o.user !== "string") throw new Error(`${SERVICE_NAME}:validate - credentials.user must be string`);
    creds.user = o.user;
  }
  if (o.pass !== undefined) {
    if (typeof o.pass !== "string") throw new Error(`${SERVICE_NAME}:validate - credentials.pass must be string`);
    creds.pass = o.pass;
  }
  if (o.jwt !== undefined) {
    if (typeof o.jwt !== "string") throw new Error(`${SERVICE_NAME}:validate - credentials.jwt must be string`);
    creds.jwt = o.jwt;
  }
  if (o.nkeySeed !== undefined) {
    if (typeof o.nkeySeed !== "string") throw new Error(`${SERVICE_NAME}:validate - credentials.nkeySeed must be string`);
    creds.nkeySeed = o.nkeySeed;
  }
  if (o.expiresAt !== undefined) {
    if (typeof o.expiresAt !== "number") throw new Error(`${SERVICE_NAME}:validate - credentials.expiresAt must be number`);
    creds.expiresAt = o.expiresAt;
  }
  if (!creds.token && !creds.user && !creds.jwt) {
    throw new Error(`${SERVICE_NAME}:validate - Auth server response must include at least one of: token, user, jwt`);
  }
  return creds;
}

export interface HttpNatsAuthProviderConfig {
  /** Base URL of the auth server (e.g., "https://auth.example.com") */
  authServerUrl: string;
  /** Optional custom fetch implementation (for testing or environments without global fetch) */
  fetchImpl?: typeof fetch;
}

/**
 * Creates an HTTP-based NatsAuthProvider that calls the auth server's
 * sandbox credential endpoint.
 *
 * Usage:
 * ```typescript
 * const authProvider = createHttpNatsAuthProvider({
 *   authServerUrl: "https://auth.example.com",
 * });
 *
 * const client = new CapabilityClient({
 *   config: { natsAuthProvider: authProvider, ... },
 * });
 * ```
 */
export function createHttpNatsAuthProvider(config: HttpNatsAuthProviderConfig): NatsAuthProvider {
  const fetchFn = config.fetchImpl ?? globalThis.fetch;

  return async (params: NatsAuthProviderParams): Promise<NatsCredentials> => {
    const url = `${config.authServerUrl.replace(/\/+$/, "")}/sandbox/credentials`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (params.accessToken) {
      headers["Authorization"] = `Bearer ${params.accessToken}`;
    }

    const response = await fetchFn(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ natsUrl: params.natsUrl }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `${SERVICE_NAME}:request - Auth server returned ${response.status} for ${params.natsUrl}: ${errorBody}`
      );
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch (err) {
      throw new Error(`${SERVICE_NAME}:request - Auth server response is not JSON: ${(err as Error).message}`);
    }
    return validateNatsCredentials(raw);
  };
}
