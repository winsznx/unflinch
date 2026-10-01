import { notFound } from "next/navigation";

import { OrbisDemo } from "@/components/orbis-demo";
import { privateMetadata } from "@/lib/seo";
import "./lab.css";

export const metadata = privateMetadata("Unflinch lab");

export default function OrbisLabPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="orbis-lab">
      <main>
        <header>
          <h1>Orbis lab</h1>
          <p>
            Connect, generate a continuous live video, then steer it by changing the prompt while it
            runs.
          </p>
        </header>
        <OrbisDemo />
      </main>
    </div>
  );
}
