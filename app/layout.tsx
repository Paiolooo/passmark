import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

// Self-hosted at build time by next/font: no requests to other domains at runtime.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });

export const metadata: Metadata = {
  title: "PassMark — Grade & GPA calculator for IE students",
  description: "PassMark — Grade & GPA calculator for IE students",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1411" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${geist.variable}`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-ink"
        >
          Skip to content
        </a>
        <SiteHeader />
        <div id="main" className="flex flex-1 flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
