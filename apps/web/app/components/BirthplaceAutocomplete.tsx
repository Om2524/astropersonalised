"use client";

import { useAction } from "convex/react";
import { Loader2, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@convex/_generated/api";

export type BirthplaceSuggestion = {
  displayName: string;
  latitude: number;
  longitude: number;
};

interface BirthplaceAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (suggestion: BirthplaceSuggestion) => void;
  placeholder?: string;
  required?: boolean;
}

export default function BirthplaceAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "e.g., Mumbai, India",
  required = false,
}: BirthplaceAutocompleteProps) {
  const suggestBirthplaces = useAction(
    api.actions.placeSuggestions.suggestBirthplaces
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<BirthplaceSuggestion[]>([]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;

    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const results = await suggestBirthplaces({ query });
        if (requestIdRef.current !== currentRequestId) return;
        setSuggestions(results);
        setIsOpen(results.length > 0);
      } catch (error) {
        if (requestIdRef.current !== currentRequestId) return;
        console.error("Failed to load birthplace suggestions:", error);
        setSuggestions([]);
      } finally {
        if (requestIdRef.current === currentRequestId) {
          setLoading(false);
        }
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [suggestBirthplaces, value]);

  function handleSelect(suggestion: BirthplaceSuggestion) {
    onChange(suggestion.displayName);
    onSelect?.(suggestion);
    setSuggestions([]);
    setIsOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        type="text"
        required={required}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          if (suggestions.length > 0) {
            setIsOpen(true);
          }
        }}
        placeholder={placeholder}
        className="glass-input-field pr-10"
        autoComplete="off"
      />

      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-text-secondary">
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <MapPin size={16} />
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-white/45 bg-white/90 shadow-[0_14px_32px_rgba(15,23,42,0.12)] backdrop-blur-xl">
          {suggestions.map((suggestion) => (
            <button
              key={`${suggestion.displayName}:${suggestion.latitude}:${suggestion.longitude}`}
              type="button"
              onClick={() => handleSelect(suggestion)}
              className="flex w-full items-start gap-2.5 border-b border-black/5 px-3 py-3 text-left text-sm text-text-primary transition-colors last:border-b-0 hover:bg-accent/6"
            >
              <MapPin size={15} className="mt-0.5 shrink-0 text-accent" />
              <span>{suggestion.displayName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
