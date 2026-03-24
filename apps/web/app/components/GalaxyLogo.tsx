"use client";

export default function GalaxyLogo({ size = 56 }: { size?: number }) {
  return (
    <img
      src="/logo.png"
      alt="Tara logo"
      width={size}
      height={size}
      style={{ objectFit: "contain" }}
    />
  );
}
