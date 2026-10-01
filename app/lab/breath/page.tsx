import { notFound } from "next/navigation";

import { BreathLab } from "@/components/sensor/BreathLab";
import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata("Unflinch lab");

export default function BreathLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BreathLab />;
}
