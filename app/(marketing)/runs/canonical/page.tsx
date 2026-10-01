import { redirect } from "next/navigation";

import { RunEmpty } from "@/components/proof/RunEmpty";
import { isRunId } from "@/lib/proof/runs";
import { pageMetadata } from "@/lib/seo";
import "../../proof.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Canonical live run",
  description: "The reference live run: recording, timeline, decision log and receipt.",
  path: "/runs/canonical",
  og: "kind=run",
});

export default function CanonicalRunPage() {
  const id = process.env.CANONICAL_RUN_ID?.trim();
  if (id && isRunId(id)) redirect(`/runs/${id}`);

  return (
    <RunEmpty
      title="No canonical run yet"
      copy="The canonical run is published once it has been recorded and checked. Until then, try it yourself or read the proof campaign."
    />
  );
}
