import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"], variable: "--font-figtree" });

export const metadata: Metadata = {
  title: "One Line",
  description: "One queue for walk-in and DoorDash orders, with a scheduler that says when to start each one.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={figtree.variable}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
