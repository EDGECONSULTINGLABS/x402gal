import { Dashboard } from "@/components/Dashboard";
import { getDashboardState, DashboardState } from "@/lib/getState";

export const dynamic = "force-dynamic";

export default function Page() {
  const initialState: DashboardState = getDashboardState();
  return <Dashboard initialState={initialState} />;
}
