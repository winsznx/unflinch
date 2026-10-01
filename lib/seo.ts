import type { Metadata } from "next";

import { SITE } from "@/lib/site";

type PageMetadataInput = {
  title: string;
  description: string;
  /** Canonical path, e.g. "/proof". Omit for pages that should not advertise a URL. */
  path?: string;
  /** Query string for `/api/og`, e.g. "kind=run&fear=dogs". */
  og: string;
};

export function pageMetadata({ title, description, path, og }: PageMetadataInput): Metadata {
  const image = { url: `/api/og?${og}`, width: 1200, height: 630, alt: title };
  return {
    title,
    description,
    ...(path ? { alternates: { canonical: path } } : {}),
    openGraph: {
      type: "website",
      siteName: SITE.name,
      title,
      description,
      ...(path ? { url: path } : {}),
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image.url],
    },
  };
}

/** Session and lab pages: shareable card, never indexed. */
export function privateMetadata(title: string): Metadata {
  return {
    ...pageMetadata({ title, description: SITE.tagline, og: "kind=private" }),
    robots: { index: false, follow: false },
  };
}
