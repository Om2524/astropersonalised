import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

/**
 * iktara database schema.
 *
 * All tables use compound indexes for efficient querying.
 * The queryUsage and readings tables require compound indexes
 * to avoid full table scans during rolling-window rate limiting
 * (Convex has a 32,000 document scan limit per transaction).
 */
const schema = defineSchema({
  ...authTables,

  /**
   * Registered users (post-authentication).
   * Anonymous users only have a session record until they sign up.
   */
  users: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    authProvider: v.string(),
    language: v.string(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  /**
   * Anonymous and authenticated sessions.
   * Each browser tab/device gets a UUID sessionId stored in localStorage.
   * After sign-up, the session is linked to a userId.
   */
  sessions: defineTable({
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    createdAt: v.number(),
  }).index("by_sessionId", ["sessionId"]),

  /**
   * Birth profile data entered during onboarding.
   * One per session; upserted when user re-enters details.
   */
  birthProfiles: defineTable({
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    dateOfBirth: v.string(),
    timeOfBirth: v.optional(v.string()),
    birthplace: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    timezone: v.string(),
    birthTimeQuality: v.string(),
    tone: v.string(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_userId", ["userId"]),

  /**
   * Canonical chart objects computed by the Python API.
   * Stored as JSON-serialized blobs — not queried by individual fields.
   */
  canonicalCharts: defineTable({
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    chartData: v.string(),
    computedAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_userId", ["userId"]),

  /**
   * Individual reading results from the astrology AI.
   * Compound indexes on [sessionId, createdAt] and [userId, createdAt]
   * enable efficient time-ordered listing without full scans.
   */
  readings: defineTable({
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    query: v.string(),
    method: v.string(),
    domain: v.string(),
    classification: v.string(),
    evidenceSummary: v.string(),
    reading: v.string(),
    isSaved: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_sessionId", ["sessionId", "createdAt"])
    .index("by_userId", ["userId", "createdAt"])
    .index("by_userId_saved", ["userId", "isSaved", "createdAt"]),

  /**
   * One record per query for rate limiting.
   * Compound indexes on [sessionId, queriedAt] and [userId, queriedAt]
   * are critical for the rolling 7-day window count query.
   */
  queryUsage: defineTable({
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    queriedAt: v.number(),
  })
    .index("by_sessionId", ["sessionId", "queriedAt"])
    .index("by_userId", ["userId", "queriedAt"]),
});

export default schema;
