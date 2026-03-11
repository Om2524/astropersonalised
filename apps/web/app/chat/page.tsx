"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useApp } from "@/app/store";
import { askReadingStream } from "@/app/api";
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

/**
 * Split streaming content into main body and "Explore Further" questions.
 * The streaming prompt produces a "## Explore Further" section with bullet points.
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
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
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
 *
 * Why this works like ChatGPT:
 * 1. Incoming Gemini chunks go into a raw buffer
 * 2. We reveal word-by-word (not char-by-char) — words are the natural reading unit
 * 3. We throttle React state updates to every 50ms instead of every frame
 *    This means react-markdown only re-parses ~20x/sec, not 60x
 * 4. Words appear at a natural reading pace (~15 words/sec)
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

    // Tick every 50ms — reveal next batch of words
    timerRef.current = setInterval(() => {
      if (revealedRef.current.length >= rawRef.current.length) return;

      const remaining = rawRef.current.slice(revealedRef.current.length);

      // Reveal ~3-4 words per tick (at 50ms interval = ~60-80 words/sec)
      // Find the position after the next 3 word boundaries
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
  const { profile, chart } = useApp();
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
    (query: string) => {
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

      const abort = askReadingStream(
        {
          query,
          method,
          tone: profile?.tone || "practical",
          chart_data: chart
            ? (chart as unknown as Record<string, unknown>)
            : undefined,
          date_of_birth: profile?.date_of_birth,
          time_of_birth: profile?.time_of_birth,
          birthplace: profile?.birthplace,
          birth_time_quality: profile?.birth_time_quality,
        },
        {
          onLedger(step, message) {
            setLedgerSteps((prev) => [...prev, { step, message }]);
          },
          onClassification(data) {
            classification = data;
          },
          onEvidence(data) {
            evidenceSummary = data;
          },
          onPlanetContext(data) {
            planetContext = data as unknown as PlanetContext;
            // Immediately show planet context on the message
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, planet_context: planetContext }
                  : m
              )
            );
          },
          onContent(text) {
            fullContent += text;
            streamBuffer.push(text);
          },
          onDone(data) {
            streamBuffer.flush();
            streamBuffer.stop();
            setLedgerComplete(true);

            const reading = data.reading as ReadingResponse | undefined;
            const methodUsed = data.method_used as string | undefined;

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
          },
          onError(message) {
            streamBuffer.stop();
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: `Something went wrong: ${message}. Please try again.`,
                    }
                  : m
              )
            );
            setIsLoading(false);
            setLedgerComplete(true);
          },
        }
      );

      abortRef.current = abort;
    },
    [isLoading, method, profile, chart, streamBuffer]
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
                      /* User message — glass bubble, right-aligned */
                      <div className="flex justify-end">
                        <div className="user-bubble rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-text-primary max-w-[80%]">
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      /* Assistant message */
                      <div>
                        {/* Thinking state */}
                        {isLoading &&
                          msg.id === messages[messages.length - 1]?.id && (
                            <AnalysisLedger
                              steps={ledgerSteps}
                              isComplete={ledgerComplete}
                            />
                          )}

                        {/* Visual planet context cards — show after planet_context arrives */}
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

                        {/* Method badge */}
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
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
