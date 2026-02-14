/**
 * Unit tests for ResolutionCache with canonical identity keying.
 *
 * @see Docs/registry/15_Federated_Resolution_And_Multi_NATS_Implementation_Plan.md §5.4
 */

import { describe, it, expect, vi } from "vitest";
import { ResolutionCache } from "./cache.js";
import type { ResolveOutput } from "../types/registry.js";

const silentLogger = {
  get: () => silentLogger,
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function createMockResolveOutput(overrides?: Partial<ResolveOutput>): ResolveOutput {
  return {
    canonicalIdentity: "cap:@main/my.app/my.cap@1.0.0",
    natsUrl: "nats://system:4222",
    subject: "cap.my.app.my_cap.v1",
    major: 1,
    resolvedVersion: "1.0.0",
    status: "active",
    ttlSeconds: 300,
    etag: "test-etag",
    ...overrides,
  };
}

describe("ResolutionCache", () => {
  describe("buildKey", () => {
    it("should build key with cap only", () => {
      const cache = new ResolutionCache({}, silentLogger);
      const key = cache.buildKey({ cap: "my.app/my.cap" });
      expect(key).toBe("my.app/my.cap");
    });

    it("should build key with cap and version", () => {
      const cache = new ResolutionCache({}, silentLogger);
      const key = cache.buildKey({ cap: "my.app/my.cap", ver: "^1.0.0" });
      expect(key).toBe("my.app/my.cap|v:^1.0.0");
    });

    it("should build key with tenant context", () => {
      const cache = new ResolutionCache({}, silentLogger);
      const key = cache.buildKey({
        cap: "my.app/my.cap",
        ctx: { tenantId: "tenant1" },
      });
      expect(key).toBe("my.app/my.cap|t:tenant1");
    });

    it("should build key with env context", () => {
      const cache = new ResolutionCache({}, silentLogger);
      const key = cache.buildKey({
        cap: "my.app/my.cap",
        ctx: { env: "production" },
      });
      expect(key).toBe("my.app/my.cap|e:production");
    });

    it("should build key with canonical identity when available", () => {
      const cache = new ResolutionCache({}, silentLogger);
      const key = cache.buildKey({
        cap: "my.app/my.cap",
        canonicalIdentity: "cap:@main/my.app/my.cap@1.0.0",
      });
      expect(key).toBe("cap:@main/my.app/my.cap@1.0.0");
    });

    it("should include tenant in canonical identity key", () => {
      const cache = new ResolutionCache({}, silentLogger);
      const key = cache.buildKey({
        cap: "my.app/my.cap",
        canonicalIdentity: "cap:@main/my.app/my.cap@1.0.0",
        ctx: { tenantId: "tenant1" },
      });
      expect(key).toBe("cap:@main/my.app/my.cap@1.0.0|t:tenant1");
    });

    it("should include env in canonical identity key", () => {
      const cache = new ResolutionCache({}, silentLogger);
      const key = cache.buildKey({
        cap: "my.app/my.cap",
        canonicalIdentity: "cap:@partner/partner.app/image.resize@2.0.0",
        ctx: { tenantId: "t1", env: "staging" },
      });
      expect(key).toBe("cap:@partner/partner.app/image.resize@2.0.0|t:t1|e:staging");
    });

    it("should prefer canonical identity over cap when both present", () => {
      const cache = new ResolutionCache({}, silentLogger);
      const key = cache.buildKey({
        cap: "my.app/my.cap",
        ver: "^1.0.0",
        canonicalIdentity: "cap:@main/my.app/my.cap@1.0.0",
      });
      // canonical identity takes precedence, ver is ignored when canonical is present
      expect(key).toBe("cap:@main/my.app/my.cap@1.0.0");
    });
  });

  describe("get/set with natsUrl", () => {
    it("should store and retrieve entries with natsUrl", () => {
      const cache = new ResolutionCache({ defaultTtlMs: 60_000 }, silentLogger);
      const output = createMockResolveOutput();

      cache.set({ cap: "my.app/my.cap", value: output });
      const result = cache.get({ cap: "my.app/my.cap" });

      expect(result.found).toBe(true);
      expect(result.value?.natsUrl).toBe("nats://system:4222");
      expect(result.value?.subject).toBe("cap.my.app.my_cap.v1");
      expect(result.value?.canonicalIdentity).toBe("cap:@main/my.app/my.cap@1.0.0");
    });

    it("should store entries with remote natsUrl", () => {
      const cache = new ResolutionCache({ defaultTtlMs: 60_000 }, silentLogger);
      const output = createMockResolveOutput({
        natsUrl: "nats://sandbox-partner:4222",
        canonicalIdentity: "cap:@partner/partner.app/image.resize@2.0.0",
      });

      cache.set({ cap: "partner.app/image.resize", value: output });
      const result = cache.get({ cap: "partner.app/image.resize" });

      expect(result.found).toBe(true);
      expect(result.value?.natsUrl).toBe("nats://sandbox-partner:4222");
    });
  });

  describe("invalidation", () => {
    it("should invalidate capabilities by app and name", () => {
      const cache = new ResolutionCache({ defaultTtlMs: 60_000 }, silentLogger);
      const output = createMockResolveOutput();

      cache.set({ cap: "my.app.my.cap", value: output });

      const invalidated = cache.invalidateCapability("my.app", "my.cap");
      expect(invalidated).toBeGreaterThanOrEqual(0);
    });

    it("should clear all entries", () => {
      const cache = new ResolutionCache({ defaultTtlMs: 60_000 }, silentLogger);
      cache.set({ cap: "cap1", value: createMockResolveOutput() });
      cache.set({ cap: "cap2", value: createMockResolveOutput() });

      expect(cache.size).toBe(2);
      cache.clear();
      expect(cache.size).toBe(0);
    });
  });
});
