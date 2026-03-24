import type { Metadata } from "next";
import { Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "@/app/ConvexClientProvider";
import { AppProvider } from "@/app/store";

const sourceSerif = Source_Serif_4({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tara — Personalized Astrology AI",
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
        <body className={sourceSerif.className}>
          <ConvexClientProvider>
            <AppProvider>{children}</AppProvider>
          </ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
