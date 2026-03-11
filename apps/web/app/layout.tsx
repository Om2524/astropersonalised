import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "@/app/ConvexClientProvider";
import { AppProvider } from "@/app/store";

const inter = Inter({ subsets: ["latin"] });

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
        <body className={inter.className}>
          <ConvexClientProvider>
            <AppProvider>{children}</AppProvider>
          </ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
