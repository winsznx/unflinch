import { PhoneSensor } from "@/components/sensor/PhoneSensor";
import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata("Unflinch session");

export default async function PhoneSensorPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PhoneSensor code={code.trim().toUpperCase()} />;
}
