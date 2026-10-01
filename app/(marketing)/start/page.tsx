import { IntakeForm } from "@/components/intake/IntakeForm";
import { pageMetadata } from "@/lib/seo";

import "@/components/intake/intake.css";

export const metadata = pageMetadata({
  title: "Start a session",
  description: "Name a fear and the outcome you dread. Unflinch builds a short plan and generates it live.",
  path: "/start",
  og: "kind=start",
});

export default function StartPage() {
  return (
    <main className="m-container in-page">
      <div className="in-intro">
        <span className="m-eyebrow">
          <span className="m-small-mark" aria-hidden="true">
            ✳
          </span>
          Start a session
        </span>
        <h1>Tell us what you&apos;re facing.</h1>
        <p>
          Three short rounds, each one continuous live scene. The scene waits, presses on, or eases off with
          you. Nothing here is stored with your name.
        </p>
      </div>
      <IntakeForm />
    </main>
  );
}
