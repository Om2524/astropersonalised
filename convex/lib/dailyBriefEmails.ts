type DailyBriefPayload = {
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

type SendEmailArgs = {
  to: string;
  recipientName?: string | null;
  brief: DailyBriefPayload;
};

type SendEmailResponse = {
  messageId?: string;
};

declare const process: {
  env: Record<string, string | undefined>;
};

export type LocalScheduleSnapshot = {
  dateKey: string;
  hour: number;
};

export function getLocalScheduleSnapshot(
  now: Date,
  timeZone: string
): LocalScheduleSnapshot {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const lookup = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;

  return {
    dateKey: `${lookup.year}-${lookup.month}-${lookup.day}`,
    hour: Number(lookup.hour),
  };
}

export async function sendDailyBriefEmail(
  args: SendEmailArgs
): Promise<SendEmailResponse> {
  const serviceUrl = process.env.CLOUDFLARE_EMAIL_SERVICE_URL;
  const serviceToken = process.env.CLOUDFLARE_EMAIL_SERVICE_TOKEN;

  if (!serviceUrl || !serviceToken) {
    throw new Error(
      "Missing CLOUDFLARE_EMAIL_SERVICE_URL or CLOUDFLARE_EMAIL_SERVICE_TOKEN."
    );
  }

  const email = buildDailyBriefEmail(args);

  const response = await fetch(`${serviceUrl.replace(/\/$/, "")}/internal/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(email),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Cloudflare email service error (${response.status}): ${errorBody}`
    );
  }

  return (await response.json()) as SendEmailResponse;
}

function buildDailyBriefEmail({ to, recipientName, brief }: SendEmailArgs) {
  const appBaseUrl = process.env.FORSEE_APP_URL ?? "https://forsee.life";
  const settingsUrl = `${appBaseUrl.replace(/\/$/, "")}/settings`;
  const chatUrl = `${appBaseUrl.replace(/\/$/, "")}/chat`;
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${brief.date}T00:00:00Z`));

  const greeting = recipientName?.trim()
    ? `Hi ${recipientName.trim()},`
    : "Hi,";

  const mood = brief.mood || "steady";
  const focusArea = brief.focus_area || "clarity";
  const moonSign = brief.moon_sign || "Unknown";
  const moonNakshatra = brief.moon_nakshatra || "Unknown";
  const transitCount = brief.active_transits ?? 0;

  const html = `
    <div style="margin:0;padding:32px 20px;background:#f6efe4;font-family:Georgia,'Times New Roman',serif;color:#1f1b17;">
      <div style="max-width:640px;margin:0 auto;background:#fffaf2;border:1px solid #e7d9c3;border-radius:20px;overflow:hidden;">
        <div style="padding:28px 28px 20px;background:linear-gradient(135deg,#efe0c4 0%,#f7f1e8 100%);border-bottom:1px solid #e7d9c3;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#7a5f38;margin-bottom:10px;">Forsee Daily Brief</div>
          <h1 style="margin:0 0 8px;font-size:30px;line-height:1.15;color:#221d18;">${escapeHtml(brief.title)}</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#5d4c35;">${formattedDate}</p>
        </div>

        <div style="padding:28px;">
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;">${escapeHtml(greeting)}</p>
          <p style="margin:0 0 22px;font-size:16px;line-height:1.8;color:#312a23;">${escapeHtml(brief.summary)}</p>

          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0 0 22px;">
            ${metricCard("Mood", mood)}
            ${metricCard("Focus", focusArea)}
            ${metricCard("Moon", moonSign)}
            ${metricCard("Nakshatra", moonNakshatra)}
          </div>

          <div style="margin:0 0 22px;padding:18px;border-radius:16px;background:#f3eadc;border:1px solid #e0d0b6;">
            <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#7a5f38;margin-bottom:8px;">Today&apos;s guidance</div>
            <p style="margin:0 0 10px;font-size:15px;line-height:1.75;color:#2d261f;">${escapeHtml(brief.tip)}</p>
            <p style="margin:0;font-size:13px;line-height:1.6;color:#6e5a3a;">${transitCount} active transit${transitCount === 1 ? "" : "s"} are shaping the tone of the day.</p>
          </div>

          <div style="margin:0 0 22px;font-size:14px;line-height:1.8;color:#5d4c35;">
            Continue the thread in <a href="${chatUrl}" style="color:#7a3f00;">your Forsee chat</a> or update your delivery settings in <a href="${settingsUrl}" style="color:#7a3f00;">settings</a>.
          </div>
        </div>
      </div>
    </div>
  `;

  const text = [
    `${brief.title}`,
    formattedDate,
    "",
    greeting,
    "",
    brief.summary,
    "",
    `Mood: ${mood}`,
    `Focus: ${focusArea}`,
    `Moon: ${moonSign}`,
    `Nakshatra: ${moonNakshatra}`,
    `Active transits: ${transitCount}`,
    "",
    `Today's guidance: ${brief.tip}`,
    "",
    `Continue in chat: ${chatUrl}`,
    `Manage email settings: ${settingsUrl}`,
  ].join("\n");

  return {
    to,
    subject: `${brief.title} · ${formattedDate}`,
    html,
    text,
  };
}

function metricCard(label: string, value: string): string {
  return `
    <div style="padding:14px 16px;border:1px solid #e7d9c3;border-radius:14px;background:#fff7ec;">
      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#8b6c3e;margin-bottom:4px;">${escapeHtml(label)}</div>
      <div style="font-size:15px;line-height:1.5;color:#251f19;">${escapeHtml(value)}</div>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
