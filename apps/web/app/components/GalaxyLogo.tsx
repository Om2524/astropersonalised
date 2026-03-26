"use client";

export default function GalaxyLogo({ size = 56 }: { size?: number }) {
  return (
    <img
      src="/logo.png"
      alt="Iktara logo"
      width={size}
      height={size}
      style={{ objectFit: "contain" }}
    />
  );
}
