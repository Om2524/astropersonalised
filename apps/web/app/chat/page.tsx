"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useApp } from "@/app/store";
import { useSubscription } from "@/app/hooks/useSubscription";
import type { ChatMessage, ReadingResponse, PlanetContext } from "@/app/types";
import Sidebar from "./components/Sidebar";
import ChatInput from "./components/ChatInput";
import ReadingCard from "./components/ReadingCard";
import AnalysisLedger from "./components/AnalysisLedger";
import StreamingMarkdown from "./components/StreamingMarkdown";
import PlanetCards from "./components/PlanetCards";
import YogaCards from "./components/YogaCards";
import HouseRelevance from "./components/HouseRelevance";
import DashaBadge from "./components/DashaBadge";
import GalaxyLogo from "@/app/components/GalaxyLogo";
import UsageIndicator from "@/app/components/UsageIndicator";

/**
 * Split streaming content into main body and "Explore Further" questions.
 */
function parseExploreFurther(content: string): {
  body: string;
  questions: string[];
} {
  const regex = /##\s*Explore\s+Further[\s\S]*$/i;
  const match = content.match(regex);
  if (!match) return { body: content, questions: [] };

  const body = content.slice(0, match.index).trimEnd();
  const section = match[0];
  const questions = section
    .split("\n")
    .map((line) => line.replace(/^[-*\u2022]\s*/, "").trim())
    .filter((line) => line.length > 10 && !line.startsWith("#"));

  return { body, questions };
}

const EXAMPLE_QUESTIONS = [
  "What does my chart say about my career path?",
  "When is a good time for a major decision?",
  "How do my relationships look this year?",
  "What are my strongest planetary influences?",
];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Word-level reveal buffer with throttled updates.
 */
function useStreamBuffer() {
  const rawRef = useRef("");
  const revealedRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callbackRef = useRef<((text: string) => void) | null>(null);

  const push = useCallback((chunk: string) => {
    rawRef.current += chunk;
  }, []);

  const start = useCallback((onUpdate: (text: string) => void) => {
    callbackRef.current = onUpdate;
    revealedRef.current = "";
    rawRef.current = "";

    timerRef.current = setInterval(() => {
      if (revealedRef.current.length >= rawRef.current.length) return;

      const remaining = rawRef.current.slice(revealedRef.current.length);
      let pos = 0;
      let wordsFound = 0;
      const wordsPerTick = 3;

      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i] === " " || remaining[i] === "\n") {
          wordsFound++;
          if (wordsFound >= wordsPerTick) {
            pos = i + 1;
            break;
          }
        }
        pos = i + 1;
      }

      revealedRef.current = rawRef.current.slice(
        0,
        revealedRef.current.length + pos
      );
      callbackRef.current?.(revealedRef.current);
    }, 50);
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    revealedRef.current = rawRef.current;
    callbackRef.current?.(revealedRef.current);
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    callbackRef.current = null;
  }, []);

  return { push, start, flush, stop };
}

export default function ChatPage() {
  const { sessionId, profile, chart, chartRaw, tone } = useApp();
  const subscription = useSubscription(sessionId);
  const authorizeStreamAction = useAction(api.actions.authorizeStream.authorizeStream);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [method, setMethod] = useState<string>("vedic");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ledgerSteps, setLedgerSteps] = useState<
    { step: number; message: string }[]
  >([]);
  const [ledgerComplete, setLedgerComplete] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const streamBuffer = useStreamBuffer();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, ledgerSteps, scrollToBottom]);

  const handleSubmit = useCallback(
    async (query: string) => {
      if (isLoading) return;

      const userMsg: ChatMessage = {
        id: generateId(),
        role: "user",
        content: query,
        timestamp: Date.now(),
      };

      const assistantId = generateId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);
      setLedgerSteps([]);
      setLedgerComplete(false);

      try {
        // Authorize the stream via Convex (handles rate limiting + HMAC token)
        const authResult = await authorizeStreamAction({
          sessionId,
          query,
          method,
        });

        if (!authResult.success || !authResult.token || !authResult.streamUrl) {
          // Rate limited or error
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content:
                      authResult.message ||
                      "You have reached your query limit for this week.",
                  }
                : m
            )
          );
          setIsLoading(false);
          setLedgerComplete(true);
          return;
        }

        // Open SSE connection directly to the Python API
        let fullContent = "";
        let classification: Record<string, unknown> | undefined;
        let evidenceSummary: Record<string, unknown> | undefined;
        let planetContext: PlanetContext | undefined;

        streamBuffer.start((revealed) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: revealed } : m
            )
          );
        });

        const controller = new AbortController();
        abortRef.current = () => controller.abort();

        const res = await fetch(authResult.streamUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authResult.token}`,
          },
          body: JSON.stringify({
            query,
            method,
            chart_data: chartRaw || "{}",
            tone: tone || "practical",
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => "Stream connection failed");
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `Something went wrong: ${errText}. Please try again.` }
                : m
            )
          );
          setIsLoading(false);
          setLedgerComplete(true);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // eslint-disable-next-line no-constant-condition
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
                  setLedgerSteps((prev) => [...prev, { step: parsed.step, message: parsed.message }]);
                  break;
                case "classification":
                  classification = parsed;
                  break;
                case "evidence_summary":
                  evidenceSummary = parsed;
                  break;
                case "planet_context":
                  planetContext = parsed as unknown as PlanetContext;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, planet_context: planetContext }
                        : m
                    )
                  );
                  break;
                case "content":
                  fullContent += parsed.text;
                  streamBuffer.push(parsed.text);
                  break;
                case "done": {
                  streamBuffer.flush();
                  streamBuffer.stop();
                  setLedgerComplete(true);

                  const reading = parsed.reading as ReadingResponse | undefined;
                  const methodUsed = parsed.method_used as string | undefined;

                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? {
                            ...m,
                            content: fullContent || reading?.direct_answer || "",
                            reading: reading,
                            classification:
                              classification as ChatMessage["classification"],
                            evidence_summary: evidenceSummary,
                            planet_context: planetContext,
                            method_used: methodUsed,
                          }
                        : m
                    )
                  );
                  setIsLoading(false);
                  break;
                }
                case "error":
                  streamBuffer.stop();
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? {
                            ...m,
                            content: `Something went wrong: ${parsed.message}. Please try again.`,
                          }
                        : m
                    )
                  );
                  setIsLoading(false);
                  setLedgerComplete(true);
                  break;
              }
            } catch {
              // skip malformed events
            }
          }
        }

        // If stream ended without a "done" event
        if (isLoading) {
          streamBuffer.flush();
          streamBuffer.stop();
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId && !m.reading
                ? { ...m, content: fullContent || m.content }
                : m
            )
          );
          setIsLoading(false);
          setLedgerComplete(true);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          streamBuffer.stop();
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: `Something went wrong: ${(err as Error).message}. Please try again.`,
                  }
                : m
            )
          );
          setIsLoading(false);
          setLedgerComplete(true);
        }
      }
    },
    [isLoading, method, sessionId, chartRaw, tone, authorizeStreamAction, streamBuffer]
  );

  const handleNewReading = useCallback(() => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
    streamBuffer.stop();
    setMessages([]);
    setIsLoading(false);
    setLedgerSteps([]);
    setLedgerComplete(false);
  }, [streamBuffer]);

  const handleFollowUp = useCallback(
    (question: string) => {
      handleSubmit(question);
    },
    [handleSubmit]
  );

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((o) => !o)}
        onNewReading={handleNewReading}
      />

      <main className="flex flex-1 flex-col overflow-hidden relative">
        {isEmpty ? (
          /* ============ WELCOME SCREEN ============ */
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <GalaxyLogo size={72} />

            <h1 className="mt-6 text-[28px] font-semibold text-text-primary tracking-tight">
              Your chart. Your clarity.
            </h1>
            <p className="mt-2 mb-10 max-w-md text-center text-[15px] text-text-secondary/70 leading-relaxed">
              Ask anything about your life — your birth chart holds the answers
            </p>

            <div className="w-full max-w-xl">
              <ChatInput
                onSubmit={handleSubmit}
                isLoading={isLoading}
                method={method}
                onMethodChange={setMethod}
                centered
              />
              {/* Usage indicator */}
              {!subscription.loading && (
                <div className="mt-2 flex justify-end">
                  <UsageIndicator
                    used={subscription.used}
                    limit={subscription.limit}
                    remaining={subscription.remaining}
                    tier={subscription.tier}
                    resetsAt={subscription.resetsAt}
                  />
                </div>
              )}
            </div>

            <div className="mt-6 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSubmit(q)}
                  className="group glass-card px-4 py-3 text-left text-sm text-text-secondary/70 transition-all hover:text-accent"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ============ CONVERSATION VIEW ============ */
          <>
            <div className="flex-1 overflow-y-auto scroll-smooth px-4 py-6 lg:px-6">
              <div className="mx-auto max-w-2xl space-y-6">
                {messages.map((msg) => (
                  <div key={msg.id}>
                    {msg.role === "user" ? (
                      <div className="flex justify-end">
                        <div className="user-bubble rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-text-primary max-w-[80%]">
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      <div>
                        {isLoading &&
                          msg.id === messages[messages.length - 1]?.id && (
                            <AnalysisLedger
                              steps={ledgerSteps}
                              isComplete={ledgerComplete}
                            />
                          )}

                        {msg.planet_context && !isLoading && (
                          <div className="mb-3">
                            <PlanetCards planets={msg.planet_context.planets} />
                            <YogaCards yogas={msg.planet_context.yogas} />
                            <HouseRelevance houses={msg.planet_context.houses} />
                            {msg.planet_context.dasha && (
                              <DashaBadge dasha={msg.planet_context.dasha} />
                            )}
                          </div>
                        )}

                        {msg.reading ? (
                          <ReadingCard
                            reading={msg.reading}
                            onAskFollowUp={handleFollowUp}
                          />
                        ) : msg.content ? (
                          (() => {
                            const isCurrentlyStreaming =
                              isLoading &&
                              msg.id === messages[messages.length - 1]?.id;
                            const { body, questions } = isCurrentlyStreaming
                              ? { body: msg.content, questions: [] }
                              : parseExploreFurther(msg.content);
                            return (
                              <>
                                <StreamingMarkdown
                                  content={body}
                                  isStreaming={isCurrentlyStreaming}
                                />
                                {questions.length > 0 && (
                                  <div className="mt-4">
                                    <p className="mb-2 text-xs font-semibold text-text-secondary">
                                      Explore Further
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {questions.map((q, i) => (
                                        <button
                                          key={i}
                                          onClick={() => handleFollowUp(q)}
                                          className="rounded-full border border-black/8 bg-white/30 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent/30 hover:text-accent hover:bg-accent/5 text-left"
                                        >
                                          {q}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            );
                          })()
                        ) : null}

                        {msg.method_used && !isLoading && (
                          <div className="mt-3">
                            <span className="rounded-full bg-accent/10 border border-accent/15 px-2.5 py-0.5 text-[10px] font-semibold text-accent">
                              {msg.method_used.toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Bottom input */}
            <div className="relative z-10 px-4 py-3 lg:px-6">
              <div className="mx-auto max-w-2xl">
                <ChatInput
                  onSubmit={handleSubmit}
                  isLoading={isLoading}
                  method={method}
                  onMethodChange={setMethod}
                />
                {!subscription.loading && (
                  <div className="mt-1 flex justify-end">
                    <UsageIndicator
                      used={subscription.used}
                      limit={subscription.limit}
                      remaining={subscription.remaining}
                      tier={subscription.tier}
                      resetsAt={subscription.resetsAt}
                    />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
