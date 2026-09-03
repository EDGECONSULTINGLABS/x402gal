import { Landing } from "@/components/Landing";
import { PreviewGate } from "@/components/PreviewGate";
import { getPreviewEmail, isPreviewGateOn } from "@/lib/previewAuth";

export const dynamic = "force-dynamic";

export default function Page() {
  if (!isPreviewGateOn()) return <Landing />;
  const email = getPreviewEmail();
  if (!email) return <PreviewGate />;
  return <Landing reviewerEmail={email} />;
}
