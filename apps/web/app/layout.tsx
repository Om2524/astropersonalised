import type { Metadata } from "next";
import "./globals.css";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "@/app/ConvexClientProvider";
import { AppProvider } from "@/app/store";

export const metadata: Metadata = {
  title: "Shastra — Personalized Astrology AI",
  description: "Personalized astrology insights powered by AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="en">
        <body className="font-sans">
          <ConvexClientProvider>
            <AppProvider>{children}</AppProvider>
          </ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
