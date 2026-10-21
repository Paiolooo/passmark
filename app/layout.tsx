import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

// Self-hosted at build time by next/font: no requests to other domains at runtime.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });

const TITLE = "PassMark — Grade & GPA calculator for IE students";
const DESCRIPTION =
  "Import your syllabus, add grades as they come in, and PassMark shows exactly what you need on each remaining exam and how every course moves your semester and overall GPA.";

export const metadata: Metadata = {
  // Absolute URLs for link previews (the share image is app/opengraph-image.tsx).
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://passmark-bay.vercel.app"),
  title: TITLE,
  description: TITLE,
  applicationName: "PassMark",
  openGraph: { type: "website", siteName: "PassMark", title: TITLE, description: DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  appleWebApp: { title: "PassMark", capable: true, statusBarStyle: "default" },
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
        <SiteFooter />
      </body>
    </html>
  );
}
