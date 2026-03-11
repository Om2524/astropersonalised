"use client";

const METHODS = [
  { value: "vedic", label: "Vedic" },
  { value: "kp", label: "KP" },
  { value: "western", label: "Western" },
  { value: "compare", label: "Compare All" },
] as const;

type Method = (typeof METHODS)[number]["value"];

interface MethodSelectorProps {
  selected: string;
  onChange: (method: Method) => void;
}

export default function MethodSelector({
  selected,
  onChange,
}: MethodSelectorProps) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none py-1 px-1">
      {METHODS.map((m) => (
        <button
          key={m.value}
          onClick={() => onChange(m.value)}
          className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
            selected === m.value
              ? "bg-accent text-graphite"
              : "bg-navy/60 text-text-secondary hover:bg-navy hover:text-text-primary"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
