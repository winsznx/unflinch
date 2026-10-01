import type { ReactNode } from "react";

import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import "./marketing.css";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="marketing-site">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
