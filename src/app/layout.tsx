import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { Providers } from "@/components/providers/Providers";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s | Scorebug",
    default: "Scorebug — Live Cricket Scoring",
  },
  description:
    "Production-grade PWA for live cricket scoring, tournament management and real-time match tracking.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Scorebug",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "Scorebug",
    title: "Scorebug — Live Cricket Scoring",
    description: "Score matches, manage tournaments, track statistics.",
  },
  twitter: {
    card: "summary",
    title: "Scorebug — Live Cricket Scoring",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#166534" },
    { media: "(prefers-color-scheme: dark)", color: "#16a34a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/**
 * Root layout.
 *
 * Only structural HTML here — content lives in child layouts/pages.
 * Providers wraps everything so TanStack Query + next-themes are available
 * across the entire app tree.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-screen font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
