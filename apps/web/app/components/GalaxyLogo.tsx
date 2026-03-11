"use client";

/**
 * Black 2D minimalist galaxy logo — bold spiral arms with white negative-space gaps,
 * inner ring with black core, and 4-point star sparkles.
 */
export default function GalaxyLogo({ size = 56 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 160 160"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Shastra galaxy logo"
    >
      {/* ── Main galaxy body: filled black ellipse tilted ~-20° ── */}
      <ellipse
        cx="80"
        cy="82"
        rx="52"
        ry="28"
        fill="#0f0f1a"
        transform="rotate(-22 80 82)"
      />

      {/* ── Outer spiral arm — upper right sweep ── */}
      <path
        d="M108 42 C122 30 138 28 142 36 C146 44 136 58 118 66 C100 74 78 76 60 72"
        stroke="#0f0f1a"
        strokeWidth="12"
        strokeLinecap="round"
        fill="none"
      />

      {/* ── Outer spiral arm — lower left sweep ── */}
      <path
        d="M52 122 C38 134 22 136 18 128 C14 120 24 106 42 98 C60 90 82 88 100 92"
        stroke="#0f0f1a"
        strokeWidth="12"
        strokeLinecap="round"
        fill="none"
      />

      {/* ── White gap cut — upper arm separation ── */}
      <path
        d="M104 50 C116 40 130 38 133 45 C136 52 127 63 112 70 C97 77 78 78 63 75"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />

      {/* ── White gap cut — lower arm separation ── */}
      <path
        d="M56 114 C44 124 30 126 27 119 C24 112 33 101 48 94 C63 87 82 86 97 89"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />

      {/* ── Second spiral layer — mid ring ── */}
      <ellipse
        cx="80"
        cy="82"
        rx="38"
        ry="20"
        fill="none"
        stroke="#0f0f1a"
        strokeWidth="10"
        transform="rotate(-22 80 82)"
      />

      {/* ── White ring cut inside second layer ── */}
      <ellipse
        cx="80"
        cy="82"
        rx="38"
        ry="20"
        fill="none"
        stroke="white"
        strokeWidth="4"
        transform="rotate(-22 80 82)"
      />

      {/* ── Inner white oval (galactic bulge gap) ── */}
      <ellipse
        cx="80"
        cy="82"
        rx="22"
        ry="12"
        fill="white"
        transform="rotate(-22 80 82)"
      />

      {/* ── Black core ellipse ── */}
      <ellipse
        cx="80"
        cy="82"
        rx="12"
        ry="6.5"
        fill="#0f0f1a"
        transform="rotate(-22 80 82)"
      />

      {/* ── Tail tip — upper right ── */}
      <path
        d="M138 32 C146 24 152 28 148 36"
        stroke="#0f0f1a"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />

      {/* ── Tail tip — lower left ── */}
      <path
        d="M22 132 C14 140 8 136 12 128"
        stroke="#0f0f1a"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />

      {/* ══ 4-POINT STAR SPARKLES ══ */}

      {/* Large — top left */}
      <path
        d="M32 28 L34.5 20 L37 28 L45 30.5 L37 33 L34.5 41 L32 33 L24 30.5Z"
        fill="#0f0f1a"
      />

      {/* Medium — top center-left */}
      <path
        d="M62 10 L63.8 4 L65.6 10 L72 11.8 L65.6 13.6 L63.8 20 L62 13.6 L55.6 11.8Z"
        fill="#0f0f1a"
      />

      {/* Small — top right area */}
      <path
        d="M112 18 L113.2 13 L114.4 18 L119 19.2 L114.4 20.4 L113.2 26 L112 20.4 L107.4 19.2Z"
        fill="#0f0f1a"
        opacity="0.8"
      />

      {/* Small — far top right */}
      <path
        d="M140 12 L141 8 L142 12 L146 13 L142 14 L141 18 L140 14 L136 13Z"
        fill="#0f0f1a"
        opacity="0.65"
      />

      {/* Small — left side */}
      <path
        d="M14 62 L15.2 57 L16.4 62 L21 63.2 L16.4 64.4 L15.2 70 L14 64.4 L9.4 63.2Z"
        fill="#0f0f1a"
        opacity="0.7"
      />

      {/* Medium — bottom right */}
      <path
        d="M132 108 L134 102 L136 108 L142 110 L136 112 L134 118 L132 112 L126 110Z"
        fill="#0f0f1a"
        opacity="0.75"
      />

      {/* Large — bottom right corner */}
      <path
        d="M148 130 L150.5 122 L153 130 L161 132.5 L153 135 L150.5 143 L148 135 L140 132.5Z"
        fill="#0f0f1a"
      />

      {/* Small — bottom center */}
      <path
        d="M78 148 L79.2 143 L80.4 148 L85 149.2 L80.4 150.4 L79.2 156 L78 150.4 L73.4 149.2Z"
        fill="#0f0f1a"
        opacity="0.6"
      />

      {/* Tiny dot sparkles */}
      <circle cx="50" cy="18" r="2" fill="#0f0f1a" opacity="0.35" />
      <circle cx="128" cy="38" r="1.5" fill="#0f0f1a" opacity="0.3" />
      <circle cx="20" cy="100" r="1.5" fill="#0f0f1a" opacity="0.25" />
      <circle cx="110" cy="148" r="1.5" fill="#0f0f1a" opacity="0.3" />
    </svg>
  );
}
