import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
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
    <html lang="en">
      <body className={inter.className}>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
