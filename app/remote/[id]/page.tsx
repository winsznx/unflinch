import { RemoteConsole } from "@/components/remote/RemoteConsole";
import { privateMetadata } from "@/lib/seo";
import "@/components/remote/remote.css";

export const metadata = privateMetadata("Unflinch session");

export default async function RemotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RemoteConsole sessionId={id} />;
}
