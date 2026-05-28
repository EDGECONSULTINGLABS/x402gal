// Removed — settlement logic has moved to lib/settlement.ts.
// This file is kept as a re-export shim so any stale import resolves cleanly.
export { settleBatch, xrplHash, routeBatch, TREASURY_ADDRESS } from "./settlement";
