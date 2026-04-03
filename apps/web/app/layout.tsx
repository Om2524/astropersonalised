import type { Metadata } from "next";
import { Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/app/ConvexClientProvider";
import { AppProvider } from "@/app/store";
import { PostHogProvider } from "@/app/providers/posthog";

const sourceSerif = Source_Serif_4({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "iktara — Personalized Astrology AI",
  description: "Personalized astrology insights powered by AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={sourceSerif.className}>
        <PostHogProvider>
          <ConvexClientProvider>
            <AppProvider>{children}</AppProvider>
          </ConvexClientProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
