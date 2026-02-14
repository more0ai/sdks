/**
 * Capability error class (shared).
 *
 * Adopted from the server's richer CapabilityError class which includes
 * retryable, status, details, and cause fields.
 *
 * @see Docs/capabilities/00_Pipeline_Implementation_Plan.md
 */

import type { CapabilityErrorCode } from "./envelope.js";

export { type CapabilityErrorCode } from "./envelope.js";

/**
 * Structured error for capability invocations.
 */
export class CapabilityError extends Error {
  public readonly code: CapabilityErrorCode;
  public readonly retryable: boolean;
  public readonly status?: number;
  public readonly details?: unknown;
  public readonly cause?: unknown;

  constructor(args: {
    code: CapabilityErrorCode;
    message: string;
    retryable?: boolean;
    status?: number;
    details?: unknown;
    cause?: unknown;
  }) {
    super(args.message);
    this.name = "CapabilityError";
    this.code = args.code;
    this.retryable = args.retryable ?? false;
    this.status = args.status;
    this.details = args.details;
    this.cause = args.cause;
  }
}
