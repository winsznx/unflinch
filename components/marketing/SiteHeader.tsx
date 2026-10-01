import Link from "next/link";

import { Logo } from "@/components/brand/Logo";
import { SITE } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="m-header">
      <div className="m-container m-header-inner">
        <Link href="/" aria-label="Unflinch home" className="m-logo">
          <Logo />
        </Link>
        <nav aria-label="Main navigation">
          <a href="/#how">How it works</a>
          <a href="/#why">Why live</a>
          <Link href="/proof">Proof</Link>
          <a href={SITE.repo} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
        <div className="m-header-actions">
          <Link href="/runs/canonical" className="m-login">
            Watch a live run
          </Link>
          <Link href="/try" className="m-button">
            Try it
          </Link>
        </div>
      </div>
    </header>
  );
}
