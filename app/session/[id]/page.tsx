import { SessionApp } from "@/components/player/SessionApp";
import { privateMetadata } from "@/lib/seo";

import "@/app/(marketing)/marketing.css";
import "@/components/player/player.css";

export const metadata = privateMetadata("Unflinch session");

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="marketing-site pl-root">
      <SessionApp id={id} />
    </div>
  );
}
