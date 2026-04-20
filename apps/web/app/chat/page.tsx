"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAction, useMutation, useQuery, useConvex } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
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
import RetryPrompt from "./components/RetryPrompt";
import GalaxyLogo from "@/app/components/GalaxyLogo";
import UsageIndicator from "@/app/components/UsageIndicator";
import AuthWall from "@/app/components/AuthWall";
import { useTranslation } from "@/app/i18n/useTranslation";
import { prewarmCompute } from "@/app/lib/prewarm";
import posthog from "posthog-js";

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

const CLIENT_STREAM_TIMEOUT_MS = 120_000;
const PENDING_QUERY_STORAGE_KEY = "shastra_pending_query";

type PendingQuery = {
  query: string;
  method: string;
  createdAt: number;
};

function savePendingQuery(pending: PendingQuery) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PENDING_QUERY_STORAGE_KEY, JSON.stringify(pending));
}

function loadPendingQuery(): PendingQuery | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(PENDING_QUERY_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PendingQuery;
    if (typeof parsed?.query !== "string" || typeof parsed?.method !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearPendingQuery() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PENDING_QUERY_STORAGE_KEY);
}

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
  const { sessionId, profile, chart, chartRaw, tone, language } = useApp();
  const { t } = useTranslation();
  const currentUser = useQuery(api.functions.users.getCurrentUser, {});
  const subscription = useSubscription(sessionId, currentUser?._id);
  const convex = useConvex();
  const authorizeStreamAction = useAction(api.actions.authorizeStream.authorizeStream);
  const storeReading = useMutation(api.functions.readings.store);
  const fetchQuery = convex.query.bind(convex);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [method, setMethod] = useState<string>("vedic");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAuthWall, setShowAuthWall] = useState(false);
  const [ledgerSteps, setLedgerSteps] = useState<
    { step: number; message: string }[]
  >([]);
  const [ledgerComplete, setLedgerComplete] = useState(false);
  const [activeReadingId, setActiveReadingId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const replayingPendingQueryRef = useRef(false);
  const streamBuffer = useStreamBuffer();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, ledgerSteps, scrollToBottom]);

  useEffect(() => {
    prewarmCompute();
  }, []);

  useEffect(() => {
    if (!subscription.canCompare && method === "compare") {
      setMethod("vedic");
    }
  }, [method, subscription.canCompare]);

  useEffect(() => {
    if (currentUser === null && loadPendingQuery()) {
      setShowAuthWall(true);
    }
  }, [currentUser]);

  const handleSubmit = useCallback(
    async (query: string, methodOverride?: string) => {
      if (isLoading || currentUser === undefined) return;
      const selectedMethod = methodOverride ?? method;

      if (currentUser === null) {
        savePendingQuery({
          query,
          method: selectedMethod,
          createdAt: Date.now(),
        });
        setMethod(selectedMethod);
        setShowAuthWall(true);
        return;
      }

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
      posthog.capture('message_sent', {
        method: selectedMethod,
        tone: profile?.tone,
      });
      setIsLoading(true);
      setLedgerSteps([]);
      setLedgerComplete(false);

      const controller = new AbortController();
      abortRef.current = () => controller.abort();

      let fullContent = "";
      let classification: Record<string, unknown> | undefined;
      let evidenceSummary: Record<string, unknown> | undefined;
      let planetContext: PlanetContext | undefined;
      let receivedDoneEvent = false;
      let receivedErrorEvent = false;

      try {
        // Authorize the stream via Convex (handles rate limiting + HMAC token)
        const authResult = await authorizeStreamAction({
          sessionId,
          userId: currentUser?._id ?? undefined,
          usageKey: assistantId,
          query,
          method: selectedMethod,
        });

        if (!authResult.success || !authResult.token || !authResult.streamUrl) {
          if (authResult.error === "auth_required") {
            savePendingQuery({
              query,
              method: selectedMethod,
              createdAt: Date.now(),
            });
            setShowAuthWall(true);
          }

          // Rate limited or error
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content:
                      authResult.message ||
                      "You’re out of messages right now.",
                  }
                : m
            )
          );
          setIsLoading(false);
          setLedgerComplete(true);
          return;
        }

        streamBuffer.start((revealed) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: revealed } : m
            )
          );
        });

        // Merge user-abort and the client timeout into a single signal
        const timeoutSignal = AbortSignal.timeout(CLIENT_STREAM_TIMEOUT_MS);
        const mergedSignal = AbortSignal.any([controller.signal, timeoutSignal]);

        const res = await fetch(authResult.streamUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authResult.token}`,
          },
          body: JSON.stringify({
            query,
            method: selectedMethod,
            chart_data: chartRaw ? JSON.parse(chartRaw).chart : {},
            tone: tone || "practical",
            language: language || "en",
          }),
          signal: mergedSignal,
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
        readerRef.current = reader;
        const decoder = new TextDecoder();
        let buffer = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // Exit early if stream was aborted
          if (mergedSignal.aborted) {
            await reader.cancel();
            break;
          }

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
                  receivedDoneEvent = true;
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

                  // Persist reading to Convex so history survives refresh
                  const cls = classification as ChatMessage["classification"];
                  storeReading({
                    sessionId,
                    userId: currentUser?._id ?? undefined,
                    query,
                    method: methodUsed ?? selectedMethod,
                    domain: cls?.domain ?? "general",
                    classification: JSON.stringify(cls ?? {}),
                    evidenceSummary: JSON.stringify(evidenceSummary ?? {}),
                    reading: JSON.stringify(reading ?? { direct_answer: fullContent }),
                  }).catch((error: unknown) =>
                    console.error("Failed to store reading:", error)
                  );

                  posthog.capture('reading_received', {
                    method: methodUsed || selectedMethod,
                  });

                  break;
                }
                case "error":
                  receivedErrorEvent = true;
                  streamBuffer.stop();
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? {
                            ...m,
                            content: `Something went wrong: ${parsed.message}.`,
                            retryable: {
                              query,
                              method: selectedMethod,
                              usageKey: assistantId,
                            },
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

        readerRef.current = null;

        // Recover if the stream closes without sending its final "done" event.
        if (!receivedDoneEvent && !receivedErrorEvent) {
          streamBuffer.flush();
          streamBuffer.stop();
          const fallbackContent =
            fullContent ||
            "The reading ended before the final answer arrived. Please try again.";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: fallbackContent,
                    classification:
                      classification as ChatMessage["classification"],
                    evidence_summary: evidenceSummary,
                    planet_context: planetContext,
                  }
                : m
            )
          );
          setIsLoading(false);
          setLedgerComplete(true);

          // Still persist whatever we received so the query isn't lost
          if (fullContent) {
            const cls = classification as ChatMessage["classification"];
            storeReading({
              sessionId,
              userId: currentUser?._id ?? undefined,
              query,
              method: selectedMethod,
              domain: cls?.domain ?? "general",
              classification: JSON.stringify(cls ?? {}),
              evidenceSummary: JSON.stringify(evidenceSummary ?? {}),
              reading: JSON.stringify({ direct_answer: fullContent }),
            }).catch((error: unknown) =>
              console.error("Failed to store partial reading:", error)
            );
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError" && controller.signal.aborted) {
          streamBuffer.stop();
          setIsLoading(false);
          setLedgerComplete(true);
          return;
        }

        const isTimeout =
          (err as Error).name === "TimeoutError" ||
          ((err as Error).name === "AbortError" && !controller.signal.aborted);
        const message = fullContent
          ? fullContent
          : isTimeout
            ? "The stars are taking longer than usual."
            : `Something went wrong: ${(err as Error).message}.`;

        streamBuffer.stop();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: message,
                  retryable: fullContent
                    ? m.retryable
                    : {
                        query,
                        method: selectedMethod,
                        usageKey: assistantId,
                      },
                }
              : m
          )
        );
        setIsLoading(false);
        setLedgerComplete(true);
      }
    },
    [
      isLoading,
      method,
      sessionId,
      chartRaw,
      tone,
      currentUser?._id,
      currentUser,
      authorizeStreamAction,
      storeReading,
      streamBuffer,
    ]
  );

  useEffect(() => {
    if (
      currentUser === undefined ||
      currentUser === null ||
      isLoading ||
      !chartRaw ||
      replayingPendingQueryRef.current
    ) {
      return;
    }

    const pending = loadPendingQuery();
    if (!pending) return;

    replayingPendingQueryRef.current = true;
    clearPendingQuery();
    setShowAuthWall(false);

    void (async () => {
      try {
        setMethod(pending.method);
        await handleSubmit(pending.query, pending.method);
      } finally {
        replayingPendingQueryRef.current = false;
      }
    })();
  }, [chartRaw, currentUser, isLoading, handleSubmit]);

  const handleNewReading = useCallback(() => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
    if (readerRef.current) {
      readerRef.current.cancel().catch(() => {});
      readerRef.current = null;
    }
    streamBuffer.stop();
    setMessages([]);
    setIsLoading(false);
    setLedgerSteps([]);
    setLedgerComplete(false);
    setActiveReadingId(null);
  }, [streamBuffer]);

  const handleLoadReading = useCallback(
    async (readingId: string) => {
      try {
        const reading = await fetchQuery(api.functions.readings.getById, {
          readingId: readingId as Id<"readings">,
        });
        if (!reading) return;

        let parsedReading: ReadingResponse | undefined;
        let directAnswer = "";
        try {
          const raw = JSON.parse(reading.reading);
          directAnswer = raw.direct_answer ?? "";
          parsedReading = raw as ReadingResponse;
        } catch {
          directAnswer = reading.reading;
        }

        let parsedClassification: ChatMessage["classification"];
        try {
          parsedClassification = JSON.parse(reading.classification);
        } catch { /* skip */ }

        const userMsg: ChatMessage = {
          id: generateId(),
          role: "user",
          content: reading.query,
          timestamp: reading.createdAt,
        };
        const assistantMsg: ChatMessage = {
          id: generateId(),
          role: "assistant",
          content: directAnswer,
          reading: parsedReading,
          classification: parsedClassification,
          method_used: reading.method,
          timestamp: reading.createdAt,
        };

        setMessages([userMsg, assistantMsg]);
        setActiveReadingId(readingId);
        setLedgerSteps([]);
        setLedgerComplete(true);
        setIsLoading(false);
      } catch (err) {
        console.error("Failed to load reading:", err);
      }
    },
    [fetchQuery]
  );

  const handleFollowUp = useCallback(
    (question: string) => {
      handleSubmit(question);
    },
    [handleSubmit]
  );

  const handleRetry = useCallback(
    (msgId: string, retryable: { query: string; method: string; usageKey: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
      handleSubmit(retryable.query, retryable.method);
    },
    [handleSubmit]
  );

  const handleRetryCancel = useCallback((msgId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
  }, []);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((o) => !o)}
        onNewReading={handleNewReading}
        onLoadReading={handleLoadReading}
        activeReadingId={activeReadingId}
      />

      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {isEmpty ? (
          /* ============ WELCOME SCREEN ============ */
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <GalaxyLogo size={120} />

            <h1 className="mt-1 text-[28px] font-semibold text-text-primary tracking-tight">
              {t("chat.welcome")}
            </h1>
            <p className="mt-2 mb-10 max-w-md text-center text-[15px] text-text-secondary/70 leading-relaxed">
              {t("chat.subtitle")}
            </p>

            <div className="w-full max-w-xl">
              <ChatInput
                onSubmit={handleSubmit}
                isLoading={isLoading}
                method={method}
                onMethodChange={setMethod}
                canCompare={subscription.canCompare}
                centered
              />
              {/* Usage indicator */}
              {!subscription.loading && (
                <div className="mt-2 flex justify-end">
                  <UsageIndicator
                    messagesAvailable={subscription.messagesAvailable}
                    freeRemaining={subscription.freeRemaining}
                    creditBalance={subscription.creditBalance}
                    tier={subscription.tier}
                    isUnlimited={subscription.isUnlimited}
                    resetsAt={subscription.resetsAt}
                  />
                </div>
              )}
            </div>

            <div className="mt-6 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
              {[t("chat.example1"), t("chat.example2"), t("chat.example3"), t("chat.example4")].map((q) => (
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
            <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-4 py-6 pb-28 lg:px-6 lg:pb-32">
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

                        {msg.reading?.direct_answer && !isLoading && (
                          <div className="mb-3 rounded-2xl border border-white/55 bg-white/45 px-4 py-3 shadow-[0_4px_18px_rgba(0,0,0,0.05)] backdrop-blur-xl">
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent/80">
                              Direct Answer
                            </p>
                            <StreamingMarkdown
                              content={msg.reading.direct_answer}
                              isStreaming={false}
                            />
                          </div>
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

                        {msg.retryable && !isLoading ? (
                          <RetryPrompt
                            message={msg.content || "Please try again."}
                            onRetry={() => handleRetry(msg.id, msg.retryable!)}
                            onCancel={() => handleRetryCancel(msg.id)}
                          />
                        ) : msg.reading ? (
                          <ReadingCard
                            reading={msg.reading}
                            onAskFollowUp={handleFollowUp}
                            hideDirectAnswer
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
            <div className="sticky bottom-0 z-10 border-t border-white/30 bg-white/12 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-xl lg:px-6">
              <div className="mx-auto max-w-2xl">
                <ChatInput
                  onSubmit={handleSubmit}
                  isLoading={isLoading}
                  method={method}
                  onMethodChange={setMethod}
                  canCompare={subscription.canCompare}
                />
                {!subscription.loading && (
                  <div className="mt-1 flex justify-end">
                    <UsageIndicator
                      messagesAvailable={subscription.messagesAvailable}
                      freeRemaining={subscription.freeRemaining}
                      creditBalance={subscription.creditBalance}
                      tier={subscription.tier}
                      isUnlimited={subscription.isUnlimited}
                      resetsAt={subscription.resetsAt}
                    />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      <AuthWall
        isOpen={showAuthWall}
        onClose={() => setShowAuthWall(false)}
        reason="Sign in to ask your first question"
        dismissible={currentUser !== null}
      />
    </div>
  );
}
