import { MatchApp } from "@/components/match/MatchApp";
import { PreviewGate } from "@/components/PreviewGate";
import { getPreviewEmail, isPreviewGateOn } from "@/lib/previewAuth";

export const dynamic = "force-dynamic";

export default function MatchPage() {
  if (isPreviewGateOn() && !getPreviewEmail()) return <PreviewGate />;
  return <MatchApp />;
}
