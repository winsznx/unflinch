import Link from "next/link";

import { Eyebrow } from "@/components/marketing/primitives";

export function RunEmpty({ title, copy }: { title: string; copy: string }) {
  return (
    <main className="m-container p-page">
      <section className="p-empty-state">
        <Eyebrow>Live run</Eyebrow>
        <h1>{title}</h1>
        <p>{copy}</p>
        <div className="p-actions">
          <Link className="m-button" href="/try">
            Try it, no signup
          </Link>
          <Link className="m-button m-button-secondary" href="/proof">
            Open the proof campaign
          </Link>
        </div>
      </section>
    </main>
  );
}
