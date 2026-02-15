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

    const credentials: NatsCredentials = await response.json();
    return credentials;
  };
}
