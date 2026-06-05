// Server component wrapper for leads page
// Forces dynamic rendering since the client component uses browser-only APIs

import LeadsPageClient from "./LeadsPageClient";

export const dynamic = "force-dynamic";

export default function LeadsPage() {
  return <LeadsPageClient />;
}
