import { TryLauncher } from "@/components/intake/TryLauncher";
import { pageMetadata } from "@/lib/seo";

import "@/components/intake/intake.css";

export const metadata = pageMetadata({
  title: "Try Unflinch live",
  description: "A four-minute live session in your browser. No phone, no signup. Your keyboard simulates breathing.",
  path: "/try",
  og: "kind=try",
});

export default function TryPage() {
  return (
    <main className="m-container in-page">
      <div className="in-intro">
        <span className="m-eyebrow">
          <span className="m-small-mark" aria-hidden="true">
            ✳
          </span>
          Judge mode
        </span>
        <h1>Try it live. No phone, no signup.</h1>
        <p>
          A four-minute live Orbis session. Your keyboard stands in for a breathing sensor, and every input is
          labelled SIMULATED INPUT. The controller and the live world are real.
        </p>
        <ul className="in-keys">
          <li>
            <kbd>S</kbd> Fast, irregular breathing for 15 s
          </li>
          <li>
            <kbd>H</kbd> Hold your breath for 15 s
          </li>
          <li>
            <kbd>0</kbd>–<kbd>9</kbd> Distress rating (9 eases the scene off)
          </li>
          <li>
            <kbd>↑</kbd> Step closer · <kbd>↓</kbd> Step back · <kbd>Space</kbd> Pause
          </li>
        </ul>
      </div>
      <TryLauncher />
    </main>
  );
}
