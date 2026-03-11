"use client";

import {
  Plus,
  Sun,
  Calendar,
  Bookmark,
  Users,
  Settings,
  LayoutGrid,
  X,
  Menu,
} from "lucide-react";
import Link from "next/link";
import GalaxyLogo from "@/app/components/GalaxyLogo";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onNewReading: () => void;
}

const NAV_ITEMS = [
  { icon: LayoutGrid, label: "My Chart", href: "/chart" },
  { icon: Sun, label: "Daily Brief", href: "/daily" },
  { icon: Calendar, label: "Weekly Outlook", href: "/weekly" },
  { icon: Bookmark, label: "Saved Readings", href: "/saved" },
  { icon: Users, label: "Personalities", href: "/personalities" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

export default function Sidebar({ isOpen, onToggle, onNewReading }: SidebarProps) {
  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={onToggle}
        className="fixed left-3 top-3 z-50 rounded-xl bg-white/30 p-2 text-text-secondary backdrop-blur-md border border-white/30 transition-colors hover:text-text-primary hover:bg-white/40 lg:hidden"
        aria-label="Toggle sidebar"
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          onClick={onToggle}
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-dvh w-[260px] flex-col glass-panel transition-transform duration-300 lg:relative lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 pt-5 pb-4">
          <GalaxyLogo size={32} />
          <span className="text-lg font-semibold tracking-tight text-text-primary">
            Shastra
          </span>
        </div>

        {/* New Reading */}
        <div className="px-3 pb-4">
          <button
            onClick={() => {
              onNewReading();
              if (window.innerWidth < 1024) onToggle();
            }}
            className="flex w-full items-center gap-2 rounded-xl border border-white/30 bg-white/20 px-3 py-2.5 text-sm font-medium text-text-primary transition-all hover:bg-white/30 hover:border-white/40"
          >
            <Plus className="h-4 w-4" />
            New Reading
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => {
                if (window.innerWidth < 1024) onToggle();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-text-secondary transition-all hover:bg-white/20 hover:text-text-primary"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4">
          <p className="text-[10px] text-text-secondary/40">
            Powered by Shastra
          </p>
        </div>
      </aside>
    </>
  );
}
