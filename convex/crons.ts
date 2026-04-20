import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Daily cleanup of expired query usage records.
 *
 * Runs at 3:00 AM UTC every day.
 * Deletes queryUsage records older than 8 days (7-day window + 1 day buffer).
 * Processes in batches of 500 to stay within Convex transaction limits.
 */
crons.daily(
  "cleanup expired query usage",
  { hourUTC: 3, minuteUTC: 0 },
  internal.functions.queryUsage.cleanupExpired
);

/**
 * Weekly cleanup of stale anonymous sessions.
 *
 * Runs every Monday at 4:00 AM UTC.
 * Deletes anonymous sessions (no userId) older than 30 days.
 * Processes in batches of 500 to stay within Convex transaction limits.
 */
crons.weekly(
  "cleanup stale anonymous sessions",
  { dayOfWeek: "monday", hourUTC: 4, minuteUTC: 0 },
  internal.functions.sessions.cleanupStale
);

/**
 * Check once per hour for users whose local delivery window just opened.
 *
 * Each user stores a preferred timezone and local send hour, so the job
 * can stay simple while still delivering on each user's morning schedule.
 */
crons.hourly(
  "dispatch daily brief emails",
  { minuteUTC: 5 },
  internal.emailBriefs.dispatchDailyBriefEmails
 );

export default crons;
