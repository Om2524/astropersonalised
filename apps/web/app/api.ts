const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function computeChart(data: {
  date_of_birth: string;
  time_of_birth?: string;
  birthplace: string;
  birth_time_quality: string;
}) {
  const res = await fetch(`${API_BASE}/api/charts/compute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function askReading(data: {
  query: string;
  method: string;
  tone: string;
  chart_data?: Record<string, unknown>;
  date_of_birth?: string;
  time_of_birth?: string;
  birthplace?: string;
  birth_time_quality?: string;
}) {
  const res = await fetch(`${API_BASE}/api/readings/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function askReadingStream(
  data: {
    query: string;
    method: string;
    tone: string;
    chart_data?: Record<string, unknown>;
    date_of_birth?: string;
    time_of_birth?: string;
    birthplace?: string;
    birth_time_quality?: string;
  },
  callbacks: {
    onLedger?: (step: number, message: string) => void;
    onClassification?: (data: Record<string, unknown>) => void;
    onEvidence?: (data: Record<string, unknown>) => void;
    onPlanetContext?: (data: Record<string, unknown>) => void;
    onContent?: (text: string) => void;
    onDone?: (data: Record<string, unknown>) => void;
    onError?: (message: string) => void;
  }
) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/readings/ask/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        callbacks.onError?.(await res.text());
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          if (!event.trim()) continue;
          const lines = event.trim().split("\n");
          let eventType = "";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7);
            else if (line.startsWith("data: ")) eventData = line.slice(6);
          }

          if (!eventType || !eventData) continue;

          try {
            const parsed = JSON.parse(eventData);
            switch (eventType) {
              case "ledger":
                callbacks.onLedger?.(parsed.step, parsed.message);
                break;
              case "classification":
                callbacks.onClassification?.(parsed);
                break;
              case "evidence_summary":
                callbacks.onEvidence?.(parsed);
                break;
              case "planet_context":
                callbacks.onPlanetContext?.(parsed);
                break;
              case "content":
                callbacks.onContent?.(parsed.text);
                break;
              case "done":
                callbacks.onDone?.(parsed);
                break;
              case "error":
                callbacks.onError?.(parsed.message);
                break;
            }
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        callbacks.onError?.((err as Error).message);
      }
    }
  })();

  return () => controller.abort();
}

export async function getDailyBrief(chartData: Record<string, unknown>, targetDate?: string) {
  const body: Record<string, unknown> = { chart_data: chartData };
  if (targetDate) body.target_date = targetDate;
  const res = await fetch(`${API_BASE}/api/briefs/daily`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getWeeklyOutlook(chartData: Record<string, unknown>, weekStart?: string) {
  const body: Record<string, unknown> = { chart_data: chartData };
  if (weekStart) body.week_start = weekStart;
  const res = await fetch(`${API_BASE}/api/briefs/weekly`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getSavedReadings(sessionId: string, limit = 20, offset = 0) {
  const res = await fetch(`${API_BASE}/api/readings/saved?session_id=${sessionId}&limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getReadingHistory(sessionId: string, limit = 20, offset = 0) {
  const res = await fetch(`${API_BASE}/api/readings/history?session_id=${sessionId}&limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function toggleSaveReading(readingId: string) {
  const res = await fetch(`${API_BASE}/api/readings/${readingId}/toggle-save`, { method: "PATCH" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getPersonalityResonance(chartData: Record<string, unknown>, topN = 10) {
  const res = await fetch(`${API_BASE}/api/resonance/personalities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chart_data: chartData, top_n: topN }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
