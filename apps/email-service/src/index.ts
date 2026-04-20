interface EmailSendResult {
  messageId: string;
}

interface EmailMessageBuilder {
  to: string | string[];
  from: string | { email: string; name: string };
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | { email: string; name: string };
  headers?: Record<string, string>;
}

interface SendEmailBinding {
  send(message: EmailMessageBuilder): Promise<EmailSendResult>;
}

interface Env {
  SEND_EMAIL: SendEmailBinding;
  INTERNAL_API_TOKEN?: string;
  EMAIL_FORWARD_TO?: string;
  DEFAULT_FROM_EMAIL?: string;
  DEFAULT_FROM_NAME?: string;
  DEFAULT_REPLY_TO?: string;
}

type SendPayload = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "forsee-mail",
        hasInternalToken: Boolean(env.INTERNAL_API_TOKEN),
        hasForwardTargets: parseEmailList(env.EMAIL_FORWARD_TO).length > 0,
      });
    }

    if (request.method === "POST" && url.pathname === "/internal/send") {
      if (!isAuthorized(request, env)) {
        return json({ ok: false, error: "Unauthorized" }, 401);
      }

      let payload: SendPayload;
      try {
        payload = (await request.json()) as SendPayload;
      } catch {
        return json({ ok: false, error: "Invalid JSON payload" }, 400);
      }

      if (!payload.to || !payload.subject || (!payload.html && !payload.text)) {
        return json(
          {
            ok: false,
            error: "Expected `to`, `subject`, and at least one of `html` or `text`",
          },
          400
        );
      }

      try {
        const result = await env.SEND_EMAIL.send({
          to: payload.to,
          cc: payload.cc,
          bcc: payload.bcc,
          from: {
            email: payload.fromEmail ?? env.DEFAULT_FROM_EMAIL ?? "briefs@forsee.life",
            name: payload.fromName ?? env.DEFAULT_FROM_NAME ?? "Forsee",
          },
          replyTo: payload.replyTo ?? env.DEFAULT_REPLY_TO,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        });

        return json({
          ok: true,
          messageId: result.messageId,
        });
      } catch (error) {
        const err = error as Error & { code?: string };
        return json(
          {
            ok: false,
            error: err.message,
            code: err.code ?? "UNKNOWN_EMAIL_ERROR",
          },
          502
        );
      }
    }

    return json({ ok: false, error: "Not found" }, 404);
  },

  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const destinations = parseEmailList(env.EMAIL_FORWARD_TO);

    if (destinations.length === 0) {
      message.setReject("This mailbox is not configured yet.");
      return;
    }

    for (const destination of destinations) {
      const headers = new Headers();
      headers.set("X-Forsee-Original-To", message.to);
      headers.set("X-Forsee-Original-From", message.from);
      await message.forward(destination, headers);
    }
  },
} satisfies ExportedHandler<Env>;

function isAuthorized(request: Request, env: Env): boolean {
  const token = env.INTERNAL_API_TOKEN;
  if (!token) {
    return false;
  }

  const authHeader = request.headers.get("Authorization");
  return authHeader === `Bearer ${token}`;
}

function parseEmailList(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
