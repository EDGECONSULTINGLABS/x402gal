import { SummitApp } from "@/components/match/SummitApp";
import { PreviewGate } from "@/components/PreviewGate";
import { getPreviewEmail, isPreviewGateOn } from "@/lib/previewAuth";

export const dynamic = "force-dynamic";

/** Preview password stays on Preview only. The attendee gate is inside SummitApp. */
export default function MatchPage() {
  if (isPreviewGateOn() && !getPreviewEmail()) return <PreviewGate />;
  return <SummitApp />;
}
