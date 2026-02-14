/**
 * Unit tests for NATS transport core — error scenarios.
 *
 * Tests that the transport core properly validates the envelope
 * and handles missing natsUrl/subject fields.
 */

import { describe, it, expect, vi } from "vitest";
import { createNatsTransportCore } from "./nats-transport.js";
import type { NatsConnectionPool } from "./connection-pool.js";
import type { InvocationEnvelope } from "@more0ai/core";

// ── Mocks ───────────────────────────────────────────────────────────

function createMockPool(overrides?: Partial<NatsConnectionPool>): NatsConnectionPool {
  return {
    getOrConnect: vi.fn().mockResolvedValue({
      request: vi.fn(),
    }),
    closeAll: vi.fn(),
    size: 1,
    getStats: vi.fn().mockReturnValue({ totalConnections: 1, activeConnections: [], defaultUrl: "nats://mock:4222" }),
    ...overrides,
  } as any;
}

function createMockEnvelope(overrides?: Partial<InvocationEnvelope>): InvocationEnvelope {
  return {
    capability: "test.cap",
    method: "test",
    params: {},
    ctx: {
      tenantId: "default",
      requestId: "test-req-1",
    },
    ...overrides,
  } as InvocationEnvelope;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("createNatsTransportCore", () => {
  describe("error scenarios", () => {
    it("should throw UNKNOWN_SUBJECT when no resolved subject", async () => {
      const pool = createMockPool();
      const core = createNatsTransportCore({ connectionPool: pool });
      const env = createMockEnvelope({ resolved: undefined });
      const signal = new AbortController().signal;

      await expect(core(env, signal)).rejects.toThrow(/No resolved subject/);
    });

    it("should throw when natsUrl is missing from resolved", async () => {
      const pool = createMockPool();
      const core = createNatsTransportCore({ connectionPool: pool });
      const env = createMockEnvelope({
        resolved: { subject: "cap.test.v1", version: "1.0.0" } as any,
      });
      const signal = new AbortController().signal;

      await expect(core(env, signal)).rejects.toThrow(/No natsUrl/);
    });

    it("should call connectionPool.getOrConnect with the resolved natsUrl", async () => {
      const mockNats = {
        request: vi.fn().mockResolvedValue({
          data: new TextEncoder().encode(JSON.stringify({ ok: true, data: { result: "ok" } })),
        }),
      };
      const pool = createMockPool({
        getOrConnect: vi.fn().mockResolvedValue(mockNats),
      });
      const core = createNatsTransportCore({ connectionPool: pool });
      const env = createMockEnvelope({
        resolved: {
          natsUrl: "nats://sandbox:4222",
          subject: "cap.test.v1",
          version: "1.0.0",
        },
      });
      const signal = new AbortController().signal;

      await core(env, signal);

      expect(pool.getOrConnect).toHaveBeenCalledWith("nats://sandbox:4222");
    });

    it("should return error result when server responds with ok=false", async () => {
      const mockNats = {
        request: vi.fn().mockResolvedValue({
          data: new TextEncoder().encode(JSON.stringify({
            ok: false,
            error: { code: "NOT_FOUND", message: "Capability not found", retryable: false },
          })),
        }),
      };
      const pool = createMockPool({
        getOrConnect: vi.fn().mockResolvedValue(mockNats),
      });
      const core = createNatsTransportCore({ connectionPool: pool });
      const env = createMockEnvelope({
        resolved: {
          natsUrl: "nats://system:4222",
          subject: "cap.test.v1",
          version: "1.0.0",
        },
      });
      const signal = new AbortController().signal;

      const result = await core(env, signal);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("NOT_FOUND");
        expect(result.error.message).toBe("Capability not found");
      }
    });

    it("should return ok result with data on success", async () => {
      const mockNats = {
        request: vi.fn().mockResolvedValue({
          data: new TextEncoder().encode(JSON.stringify({
            ok: true,
            data: { width: 800, height: 600 },
          })),
        }),
      };
      const pool = createMockPool({
        getOrConnect: vi.fn().mockResolvedValue(mockNats),
      });
      const core = createNatsTransportCore({ connectionPool: pool });
      const env = createMockEnvelope({
        resolved: {
          natsUrl: "nats://system:4222",
          subject: "cap.test.v1",
          version: "1.0.0",
        },
      });
      const signal = new AbortController().signal;

      const result = await core(env, signal);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({ width: 800, height: 600 });
        expect(result.meta.durationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
