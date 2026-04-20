"use node";

import { internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import { getLocalScheduleSnapshot, sendDailyBriefEmail } from "./lib/dailyBriefEmails";

declare const process: {
  env: Record<string, string | undefined>;
};

type DeliveryPreference = {
  _id: Id<"emailBriefPreferences">;
  userId: Id<"users">;
  email: string;
  timezone: string;
  localSendHour: number;
  lastDeliveredLocalDate?: string;
};

type DeliveryContext = {
  user: {
    name?: string;
    email?: string;
  } | null;
  chart: {
    chartData: string;
  } | null;
  birthProfile: {
    tone: string;
  } | null;
};

type DispatchResult = {
  configured: boolean;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
};

export const dispatchDailyBriefEmails = internalAction({
  args: {},
  handler: async (ctx): Promise<DispatchResult> => {
    if (
      !process.env.CLOUDFLARE_EMAIL_SERVICE_URL ||
      !process.env.CLOUDFLARE_EMAIL_SERVICE_TOKEN
    ) {
      console.warn(
        "Skipping daily brief email dispatch because Cloudflare email service is not configured."
      );
      return {
        configured: false,
        processed: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
      };
    }

    const preferences = (await ctx.runQuery(
      internal.functions.emailBriefs.listEnabledDailyBriefPreferences,
      {}
    )) as DeliveryPreference[];

    const now = new Date();
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const preference of preferences) {
      let snapshot;
      try {
        snapshot = getLocalScheduleSnapshot(now, preference.timezone);
      } catch (error) {
        failed += 1;
        await ctx.runMutation(internal.functions.emailBriefs.markDailyBriefFailed, {
          preferenceId: preference._id,
          error:
            error instanceof Error
              ? error.message
              : `Invalid timezone: ${preference.timezone}`,
        });
        continue;
      }

      if (snapshot.hour !== preference.localSendHour) {
        skipped += 1;
        continue;
      }

      if (preference.lastDeliveredLocalDate === snapshot.dateKey) {
        skipped += 1;
        continue;
      }

      try {
        const deliveryContext = (await ctx.runQuery(
          internal.functions.emailBriefs.getDeliveryContext,
          { userId: preference.userId }
        )) as DeliveryContext;

        if (!deliveryContext.user) {
          throw new Error("User not found for email brief delivery.");
        }
        if (!deliveryContext.chart) {
          throw new Error("No canonical chart available for this user yet.");
        }
        if (!deliveryContext.birthProfile) {
          throw new Error("No birth profile available for this user yet.");
        }

        const tier = await ctx.runQuery(api.functions.subscriptions.getCurrentTier, {
          sessionId: `email-brief:${preference.userId}`,
          userId: preference.userId,
        });

        const brief = (await ctx.runAction(api.actions.dailyBrief.dailyBrief, {
          chartData: deliveryContext.chart.chartData,
          tone: deliveryContext.birthProfile.tone,
          tier: tier.tier,
          targetDate: snapshot.dateKey,
        })) as {
          title: string;
          summary: string;
          mood: string;
          focus_area: string;
          tip: string;
          date: string;
          moon_sign?: string | null;
          moon_nakshatra?: string | null;
          active_transits?: number;
        };

        const sendResult = await sendDailyBriefEmail({
          to: preference.email,
          recipientName:
            deliveryContext.user.name ?? deliveryContext.user.email ?? undefined,
          brief,
        });

        await ctx.runMutation(internal.functions.emailBriefs.markDailyBriefSent, {
          preferenceId: preference._id,
          localDate: snapshot.dateKey,
          messageId: sendResult.messageId,
        });

        sent += 1;
      } catch (error) {
        failed += 1;
        await ctx.runMutation(internal.functions.emailBriefs.markDailyBriefFailed, {
          preferenceId: preference._id,
          error:
            error instanceof Error ? error.message : "Unknown delivery failure",
        });
      }
    }

    return {
      configured: true,
      processed: preferences.length,
      sent,
      skipped,
      failed,
    };
  },
});
