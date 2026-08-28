import { Dashboard } from "@/components/Dashboard";
import { getDashboardState, DashboardState } from "@/lib/getState";

export const dynamic = "force-dynamic";

export default function ConsolePage() {
  const initialState: DashboardState = getDashboardState();
  return <Dashboard initialState={initialState} />;
}
