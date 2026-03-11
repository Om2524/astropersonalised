"use client";

export default function CosmicLogo({ size = 56 }: { size?: number }) {
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 56 56"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Spiral arm 1 */}
        <path
          d="M28 28C28 22 31 17 36 15C40 13.5 44 15 45 19"
          stroke="#1a1a2e"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.7"
        />
        {/* Spiral arm 2 */}
        <path
          d="M28 28C28 34 25 39 20 41C16 42.5 12 41 11 37"
          stroke="#1a1a2e"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.7"
        />
        {/* Spiral arm 3 — shorter */}
        <path
          d="M28 28C23 26 19 22 19 18"
          stroke="#1a1a2e"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.45"
        />
        {/* Spiral arm 4 — shorter */}
        <path
          d="M28 28C33 30 37 34 37 38"
          stroke="#1a1a2e"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.45"
        />

        {/* Core */}
        <circle cx="28" cy="28" r="2.5" fill="#1a1a2e" opacity="0.8" />
        <circle cx="28" cy="28" r="1" fill="#1a1a2e" />

        {/* Star dots scattered around */}
        <circle cx="45" cy="19" r="1.2" fill="#1a1a2e" opacity="0.5" />
        <circle cx="11" cy="37" r="1.2" fill="#1a1a2e" opacity="0.5" />
        <circle cx="19" cy="18" r="0.9" fill="#1a1a2e" opacity="0.35" />
        <circle cx="37" cy="38" r="0.9" fill="#1a1a2e" opacity="0.35" />
        <circle cx="40" cy="12" r="0.6" fill="#1a1a2e" opacity="0.25" />
        <circle cx="16" cy="44" r="0.6" fill="#1a1a2e" opacity="0.25" />
        <circle cx="14" cy="22" r="0.5" fill="#1a1a2e" opacity="0.2" />
        <circle cx="42" cy="34" r="0.5" fill="#1a1a2e" opacity="0.2" />
      </svg>
    </div>
  );
}
