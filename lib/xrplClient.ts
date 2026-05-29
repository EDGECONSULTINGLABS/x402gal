// Shared XRPL client singleton for server-side use only.
// Keeps a single WebSocket connection alive across API route invocations
// within the same Node.js process (dev server / long-lived Lambda).
// On cold-start it lazily connects; callers await getClient() before use.

import { Client } from "xrpl";

declare global {
  // eslint-disable-next-line no-var
  var __xrplClient: Client | undefined;
}

export function xrplEndpoint(): string {
  return process.env.XRPL_ENDPOINT ?? "wss://s.altnet.rippletest.net:51233";
}

export async function getClient(): Promise<Client> {
  if (!globalThis.__xrplClient) {
    globalThis.__xrplClient = new Client(xrplEndpoint());
  }
  const client = globalThis.__xrplClient;
  if (!client.isConnected()) {
    await client.connect();
  }
  return client;
}

export function isXrplConfigured(): boolean {
  return !!(
    process.env.HYDROCOIN_ISSUER_SEED &&
    process.env.HYDROCOIN_ISSUER_ADDRESS &&
    process.env.XRPL_TREASURY_SEED &&
    process.env.XRPL_TREASURY_ADDRESS &&
    process.env.HYDROCOIN_CURRENCY
  );
}
