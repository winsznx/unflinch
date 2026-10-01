import Link from "next/link";

import { Logo } from "@/components/brand/Logo";
import { SITE } from "@/lib/site";

type FooterLink = { href: string; label: string };

const FOOTER_COLUMNS: { heading: string; links: FooterLink[] }[] = [
  {
    heading: "Product",
    links: [
      { href: "/try", label: "Try it" },
      { href: "/start", label: "Start a session" },
      { href: "/runs/canonical", label: "Live run" },
    ],
  },
  {
    heading: "Evidence",
    links: [
      { href: "/proof", label: "Proof" },
      { href: "/runs/canonical", label: "Canonical receipt" },
      { href: SITE.repo, label: "GitHub" },
    ],
  },
  {
    heading: "For therapists",
    links: [
      { href: SITE.therapistMailto, label: "Email us" },
      { href: "/#how", label: "How it works" },
      { href: "/#safety", label: "Safety rules" },
    ],
  },
];

function FooterAnchor({ link }: { link: FooterLink }) {
  if (link.href.startsWith("/") && !link.href.startsWith("/#")) {
    return <Link href={link.href}>{link.label}</Link>;
  }
  const external = link.href.startsWith("http");
  return (
    <a href={link.href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
      {link.label}
    </a>
  );
}

export function SiteFooter() {
  return (
    <footer className="m-footer m-container">
      <div className="m-footer-grid">
        <div>
          <Link href="/" aria-label="Unflinch home" className="m-logo">
            <Logo />
          </Link>
          <p>
            Practise facing a specific fear in a live scene that waits, presses on, or backs off
            with you.
          </p>
        </div>
        {FOOTER_COLUMNS.map((column) => (
          <div key={column.heading}>
            <h3>{column.heading}</h3>
            {column.links.map((link) => (
              <FooterAnchor key={`${column.heading}-${link.label}`} link={link} />
            ))}
          </div>
        ))}
      </div>
      <div className="m-footer-bottom">
        <span>© {new Date().getFullYear()} Unflinch</span>
        <span>Not a medical device · Built on Visko Orbis via Reactor</span>
      </div>
    </footer>
  );
}
