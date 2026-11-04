import { describe, expect, it } from "vitest";
import { LIVE_LIMITS, LiveRequestSchema } from "@/core/agent/live-request";
import { createRateLimiter } from "@/core/rate-limit";

const doc = (id: string, overrides = {}) => ({ id, title: "T", kind: "note", content: "x", ...overrides });

describe("live request", () => {
  it("accepts a normal request", () => {
    expect(LiveRequestSchema.safeParse({ docs: [doc("a")] }).success).toBe(true);
  });

  it("rejects no documents, too many, or duplicates", () => {
    expect(LiveRequestSchema.safeParse({ docs: [] }).success).toBe(false);
    const many = Array.from({ length: LIVE_LIMITS.maxDocs + 1 }, (_, index) => doc(`d${index}`));
    expect(LiveRequestSchema.safeParse({ docs: many }).success).toBe(false);
    expect(LiveRequestSchema.safeParse({ docs: [doc("a"), doc("a")] }).success).toBe(false);
  });

  it("rejects oversized content and unsupported images", () => {
    const big = doc("a", { content: "x".repeat(LIVE_LIMITS.maxContentChars + 1) });
    expect(LiveRequestSchema.safeParse({ docs: [big] }).success).toBe(false);
    expect(LiveRequestSchema.safeParse({ docs: [doc("a", { kind: "image", mime: "image/gif" })] }).success).toBe(false);
  });
});

describe("rate limiter", () => {
  it("blocks past the limit and recovers after the window", () => {
    const allow = createRateLimiter(2, 1000);
    expect([allow("a", 0), allow("a", 1), allow("a", 2)]).toEqual([true, true, false]);
    expect(allow("a", 1001)).toBe(true);
  });

  it("tracks keys separately", () => {
    const allow = createRateLimiter(1, 1000);
    expect([allow("a", 0), allow("b", 0)]).toEqual([true, true]);
  });
});
