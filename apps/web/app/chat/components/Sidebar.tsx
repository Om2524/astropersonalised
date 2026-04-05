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
import { api } from "@convex/_generated/api";
import posthog from "posthog-js";
import GalaxyLogo from "@/app/components/GalaxyLogo";
import { useApp } from "@/app/store";
import { useSubscription } from "@/app/hooks/useSubscription";
import { useTranslation } from "@/app/i18n/useTranslation";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onNewReading: () => void;
  onLoadReading: (readingId: string) => void;
  activeReadingId: string | null;
}

const NAV_ITEMS = [
  { icon: LayoutGrid, tKey: "nav.myChart", href: "/chart" },
  { icon: Sun, tKey: "nav.dailyBrief", href: "/daily" },
  { icon: Calendar, tKey: "nav.weeklyOutlook", href: "/weekly" },
  { icon: Bookmark, tKey: "nav.savedReadings", href: "/saved" },
  { icon: Users, tKey: "nav.personalities", href: "/personalities" },
  { icon: CreditCard, tKey: "nav.pricing", href: "/pricing" },
  { icon: Settings, tKey: "nav.settings", href: "/settings" },
];

const TIER_COLORS: Record<string, string> = {
  maya: "bg-text-secondary/15 text-text-secondary",
  moksha: "bg-yellow-500/15 text-yellow-600",
};

function relativeGroup(ts: number): string {
  const now = new Date();
  const d = new Date(ts);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0 && now.getDate() === d.getDate()) return "Today";
  if (diffDays <= 1 && now.getDate() - d.getDate() === 1) return "Yesterday";
  if (diffDays < 7) return "This week";
  return "Older";
}

export default function Sidebar({ isOpen, onToggle, onNewReading, onLoadReading, activeReadingId }: SidebarProps) {
  const { sessionId } = useApp();
  const { t } = useTranslation();
  const currentUser = useQuery(api.functions.users.getCurrentUser, {});
  const subscription = useSubscription(sessionId, currentUser?._id);
  const { signOut } = useAuthActions();

  const readingsByUser = useQuery(
    api.functions.readings.listByUser,
    currentUser?._id ? { userId: currentUser._id } : "skip"
  );
  const readingsBySession = useQuery(
    api.functions.readings.listBySession,
    !currentUser && sessionId ? { sessionId } : "skip"
  );
  const readings = readingsByUser ?? readingsBySession ?? [];

  const handleSignOut = () => {
    posthog.reset();
    signOut();
  };

  const isLoadingUser = currentUser === undefined;
  const isSignedIn = !!currentUser;
  const tierBadgeClass = TIER_COLORS[subscription.tier] ?? TIER_COLORS.maya;
  const tierBadgeLabel = subscription.isUnlimited
    ? "moksha"
    : `${subscription.messagesAvailable ?? 0} msgs`;

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
            iktara
          </span>
          {/* Tier badge */}
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${tierBadgeClass}`}>
            {tierBadgeLabel}
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
            {t("sidebar.newReading")}
          </button>
        </div>

        {/* Nav */}
        <nav className="space-y-0.5 px-3 shrink-0">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.tKey}
              href={item.href}
              onClick={() => {
                if (window.innerWidth < 1024) onToggle();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-text-secondary transition-all hover:bg-white/20 hover:text-text-primary"
            >
              <item.icon className="h-4 w-4" />
              {t(item.tKey)}
            </Link>
          ))}
        </nav>

        {/* Reading history — below nav, scrollable */}
        {readings.length > 0 && (
          <div className="flex-1 min-h-0 flex flex-col px-3 pt-4 pb-2 border-t border-white/10 mt-2">
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-secondary/50">
              {t("sidebar.recent")}
            </p>
            <div className="flex-1 overflow-y-auto space-y-px scrollbar-thin">
              {(() => {
                let lastGroup = "";
                return readings.map((r: { _id: string; query: string; createdAt: number }) => {
                  const group = relativeGroup(r.createdAt);
                  const showGroup = group !== lastGroup;
                  lastGroup = group;
                  return (
                    <div key={r._id}>
                      {showGroup && group !== "Today" && (
                        <p className="px-3 pt-3 pb-1 text-[10px] font-medium text-text-secondary/40">
                          {group}
                        </p>
                      )}
                      <button
                        onClick={() => {
                          onLoadReading(r._id);
                          if (window.innerWidth < 1024) onToggle();
                        }}
                        className={`flex w-full rounded-lg px-3 py-2 text-left text-[13px] leading-snug transition-colors truncate ${
                          activeReadingId === r._id
                            ? "bg-accent/10 text-accent font-medium"
                            : "text-text-secondary hover:bg-white/15 hover:text-text-primary"
                        }`}
                      >
                        {r.query.length > 42 ? r.query.slice(0, 42) + "..." : r.query}
                      </button>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* User section */}
        <div className="px-3 pb-3">
          {isLoadingUser ? null : isSignedIn ? (
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
              <p className="mb-2 text-[11px] text-text-secondary/70">
                {subscription.isUnlimited
                  ? t("sidebar.unlimitedActive")
                  : t("sidebar.messagesAvailable", { count: subscription.messagesAvailable ?? 0 })}
              </p>
              {currentUser && (
                <Link
                  href="/settings"
                  onClick={() => { if (window.innerWidth < 1024) onToggle(); }}
                  className="flex items-center gap-1.5 text-[11px] text-accent hover:underline mb-2"
                >
                  <Crown className="h-3 w-3" />
                  {t("sidebar.billingPurchases")}
                </Link>
              )}
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] text-text-secondary hover:bg-white/20 hover:text-text-primary transition-colors"
              >
                <LogOut className="h-3 w-3" />
                {t("sidebar.signOut")}
              </button>
            </div>
          ) : (
            <Link
              href="/auth/signin"
              onClick={() => { if (window.innerWidth < 1024) onToggle(); }}
              className="flex w-full items-center gap-2 rounded-xl border border-white/30 bg-white/15 px-3 py-2.5 text-sm text-text-secondary transition-all hover:bg-white/25 hover:text-text-primary"
            >
              <LogIn className="h-4 w-4" />
              {t("sidebar.signIn")}
            </Link>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3">
          <p className="text-[10px] text-text-secondary/40">
            {t("sidebar.poweredBy")}
          </p>
        </div>
      </aside>
    </>
  );
}
