import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ibmPlexMono, instrumentSans } from "./fonts";
import { SITE } from "@/lib/site";
import "./globals.css";

const DEFAULT_TITLE = "Unflinch · Face your fear at your pace";
const HOME_OG_IMAGE = { url: "/api/og?kind=home", width: 1200, height: 630, alt: DEFAULT_TITLE };

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    template: "%s · Unflinch",
    default: DEFAULT_TITLE,
  },
  description: SITE.tagline,
  applicationName: SITE.name,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: DEFAULT_TITLE,
    description: SITE.tagline,
    images: [HOME_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: SITE.tagline,
    images: [HOME_OG_IMAGE.url],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${instrumentSans.variable} ${ibmPlexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
