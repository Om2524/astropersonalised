"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";

interface StreamingMarkdownProps {
  content: string;
  isStreaming: boolean;
}

const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-lg font-semibold text-text-primary mt-4 mb-2 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-base font-semibold text-text-primary mt-4 mb-1.5 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-sm font-semibold text-text-primary mt-3 mb-1">
      {children}
    </h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-text-secondary mb-3 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-accent">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="text-text-primary italic">{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="space-y-1 mb-3 ml-1">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="space-y-1 mb-3 ml-1 list-decimal list-inside">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-text-secondary flex gap-2">
      <span className="text-accent mt-1.5 shrink-0 text-[6px]">●</span>
      <span>{children}</span>
    </li>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-accent/40 pl-3 my-2 text-text-secondary italic">
      {children}
    </blockquote>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="bg-black/5 rounded px-1.5 py-0.5 text-xs text-accent font-mono">
      {children}
    </code>
  ),
  hr: () => <hr className="border-black/5 my-4" />,
};

export default function StreamingMarkdown({
  content,
  isStreaming,
}: StreamingMarkdownProps) {
  // Memoize components object so react-markdown doesn't re-create on every render
  const components = useMemo(() => markdownComponents, []);

  if (!content) return null;

  return (
    <div className="streaming-markdown text-sm leading-relaxed text-text-primary">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <ReactMarkdown components={components as any}>
        {content}
      </ReactMarkdown>
      {isStreaming && <span className="streaming-cursor" />}
    </div>
  );
}
