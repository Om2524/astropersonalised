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
  LogIn,
  LogOut,
  Crown,
  CreditCard,
} from "lucide-react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../../../../convex/_generated/api";
import GalaxyLogo from "@/app/components/GalaxyLogo";
import { useApp } from "@/app/store";
import { useSubscription } from "@/app/hooks/useSubscription";

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
  { icon: CreditCard, label: "Pricing", href: "/pricing" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

const TIER_COLORS: Record<string, string> = {
  maya: "bg-text-secondary/15 text-text-secondary",
  dhyan: "bg-accent/15 text-accent",
  moksha: "bg-yellow-500/15 text-yellow-600",
};

export default function Sidebar({ isOpen, onToggle, onNewReading }: SidebarProps) {
  const { sessionId } = useApp();
  const subscription = useSubscription(sessionId);
  const currentUser = useQuery(api.functions.users.getCurrentUser, {});
  const { signOut } = useAuthActions();

  const isSignedIn = currentUser !== null && currentUser !== undefined;
  const tierBadgeClass = TIER_COLORS[subscription.tier] ?? TIER_COLORS.maya;

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
          {/* Tier badge */}
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${tierBadgeClass}`}>
            {subscription.tier}
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

        {/* User section */}
        <div className="px-3 pb-3">
          {isSignedIn ? (
            <div className="rounded-xl bg-white/15 border border-white/25 p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent text-xs font-semibold">
                  {(currentUser.name?.[0] ?? currentUser.email?.[0] ?? "U").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  {currentUser.name && (
                    <p className="text-xs font-medium text-text-primary truncate">
                      {currentUser.name}
                    </p>
                  )}
                  <p className="text-[10px] text-text-secondary truncate">
                    {currentUser.email}
                  </p>
                </div>
              </div>
              {subscription.tier !== "maya" && (
                <Link
                  href="/settings"
                  onClick={() => { if (window.innerWidth < 1024) onToggle(); }}
                  className="flex items-center gap-1.5 text-[11px] text-accent hover:underline mb-2"
                >
                  <Crown className="h-3 w-3" />
                  Manage subscription
                </Link>
              )}
              <button
                onClick={() => signOut()}
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] text-text-secondary hover:bg-white/20 hover:text-text-primary transition-colors"
              >
                <LogOut className="h-3 w-3" />
                Sign out
              </button>
            </div>
          ) : (
            <Link
              href="/auth/signin"
              onClick={() => { if (window.innerWidth < 1024) onToggle(); }}
              className="flex w-full items-center gap-2 rounded-xl border border-white/30 bg-white/15 px-3 py-2.5 text-sm text-text-secondary transition-all hover:bg-white/25 hover:text-text-primary"
            >
              <LogIn className="h-4 w-4" />
              Sign In
            </Link>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3">
          <p className="text-[10px] text-text-secondary/40">
            Powered by Shastra
          </p>
        </div>
      </aside>
    </>
  );
}
