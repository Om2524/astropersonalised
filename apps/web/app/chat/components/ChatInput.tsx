"use client";

import { useState, useRef, useEffect, KeyboardEvent, FormEvent } from "react";
import { ArrowUp, Loader2, ChevronDown, Check } from "lucide-react";

const METHODS = [
  { value: "vedic", label: "Vedic", desc: "Sidereal / Lahiri" },
  { value: "kp", label: "KP", desc: "Sub-lord system" },
  { value: "western", label: "Western", desc: "Tropical / Placidus" },
  { value: "compare", label: "Compare All", desc: "Cross-reference methods" },
] as const;

interface ChatInputProps {
  onSubmit: (message: string) => void;
  isLoading: boolean;
  method: string;
  onMethodChange: (method: string) => void;
  centered?: boolean;
}

export default function ChatInput({
  onSubmit,
  isLoading,
  method,
  onMethodChange,
  centered = false,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [methodOpen, setMethodOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 150) + "px";
    }
  }, [value]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMethodOpen(false);
      }
    }
    if (methodOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [methodOpen]);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSubmit(trimmed);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const selectedMethod = METHODS.find((m) => m.value === method) || METHODS[0];

  return (
    <form
      onSubmit={handleSubmit}
      className={`liquid-glass relative z-10 ${centered ? "liquid-glass-hero" : ""}`}
    >
      {/* Textarea */}
      <div className="px-5 pt-4 pb-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your career, love, timing, purpose..."
          rows={1}
          disabled={isLoading}
          className="w-full resize-none bg-transparent text-[15px] text-text-primary placeholder:text-text-secondary/35 outline-none disabled:opacity-50 min-h-[28px] leading-relaxed"
        />
      </div>

      {/* Bottom toolbar */}
      <div className="flex items-center justify-between px-4 pb-3 pt-1">
        {/* Left side */}
        <span className="text-[11px] text-text-secondary/25 select-none hidden sm:block">
          Shift+Enter for new line
        </span>

        {/* Right side — method + send */}
        <div className="flex items-center gap-2.5 ml-auto">
          {/* Method selector */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setMethodOpen(!methodOpen)}
              className="accent-pill"
            >
              {selectedMethod.label}
              <ChevronDown
                className={`h-3 w-3 transition-transform duration-200 ${
                  methodOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {methodOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-52 liquid-glass-dropdown p-1.5 z-50">
                <div className="px-2.5 py-1.5 mb-1">
                  <span className="text-[10px] font-semibold text-text-secondary/50 uppercase tracking-wider">
                    Method
                  </span>
                </div>
                {METHODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => {
                      onMethodChange(m.value);
                      setMethodOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all ${
                      method === m.value
                        ? "bg-accent/10 text-accent"
                        : "text-text-secondary hover:bg-black/5 hover:text-text-primary"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium">{m.label}</div>
                      <div className="text-[10px] opacity-50">{m.desc}</div>
                    </div>
                    {method === m.value && (
                      <Check className="h-3 w-3 text-accent shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Send button — dark circle like ChatGPT */}
          <button
            type="submit"
            disabled={!value.trim() || isLoading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-text-primary text-white transition-all disabled:opacity-20 hover:opacity-80 active:scale-95"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
