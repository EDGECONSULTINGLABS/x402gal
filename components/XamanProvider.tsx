"use client";

// Xaman (formerly XUMM) OAuth2 PKCE login context.
//
// Provides a real, persistent XRPL "sign-in" for the site header — the user
// authorizes once in the Xaman app and we keep their r-address + RLUSD balance.
// Browser-side PKCE needs ONLY the public API key (no secret):
//   NEXT_PUBLIC_XUMM_API_KEY
//
// The session survives reloads (the SDK restores it via the 'retrieved' event).
// Docs: https://docs.xaman.dev/environments/identity-oauth2-openid

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type XamanStatus = "loading" | "unconfigured" | "disconnected" | "connecting" | "connected" | "error";

/** Sign request pushed to the connected device (QR/deeplink are fallbacks). */
export interface PushedSignRequest {
  uuid: string;
  qrPng: string;
  deeplink: string;
  pushed: boolean;
}

interface XamanContextValue {
  status: XamanStatus;
  account: string | null;
  rlusd: string | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  /**
   * Create a sign request for the CONNECTED user using their authorized JWT
   * session — Xaman pushes it straight to their device (no re-scan). Returns
   * null if there's no live session. `submit:false` so we get the signed hex.
   * Pass a stored `userToken` (Xaman's issued_user_token) to force a push.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pushSignRequest: (txjson: any, instruction?: string, userToken?: string | null) => Promise<PushedSignRequest | null>;
}

const XamanContext = createContext<XamanContextValue | null>(null);

export function useXaman(): XamanContextValue {
  const ctx = useContext(XamanContext);
  if (!ctx) throw new Error("useXaman must be used within <XamanProvider>");
  return ctx;
}

export function XamanProvider({ children }: { children: ReactNode }) {
  const pkceRef = useRef<any>(null);
  // The authorized XummSdkJwt from the resolved flow — used to push sign
  // requests directly to the connected user's Xaman app.
  const sdkRef = useRef<any>(null);
  const [status, setStatus] = useState<XamanStatus>("loading");
  const [account, setAccount] = useState<string | null>(null);
  const [rlusd, setRlusd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async (addr: string) => {
    try {
      const res = await fetch(`/api/xrpl/balance?account=${encodeURIComponent(addr)}`);
      const data = await res.json();
      if (res.ok) setRlusd(typeof data.rlusd === "string" ? data.rlusd : "0");
    } catch {
      // non-fatal — balance is informational
    }
  }, []);

  const applyState = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (state: any) => {
      const acct = state?.me?.account ?? null;
      if (acct) {
        if (state?.sdk) sdkRef.current = state.sdk;
        setAccount(acct);
        setStatus("connected");
        setError(null);
        void fetchBalance(acct);
      }
    },
    [fetchBalance],
  );

  // Initialize the PKCE SDK once on mount (client-only, dynamic import).
  useEffect(() => {
    let cancelled = false;
    const apiKey = process.env.NEXT_PUBLIC_XUMM_API_KEY;
    if (!apiKey) {
      setStatus("unconfigured");
      return;
    }

    import("xumm-oauth2-pkce")
      .then(({ XummPkce }) => {
        if (cancelled) return;
        // Typed as `any`: the SDK's exported types vary across versions and we
        // only use a small, stable surface (on/state/authorize/logout). This
        // keeps `next build` type-checking from breaking on package internals.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // Pin redirectUrl to the clean origin (no path/trailing slash) so it
        // exactly matches the Origin/Redirect URIs whitelisted in the Xaman
        // Developer Console. The SDK default is document.location.href, which
        // includes a trailing slash (e.g. https://www.x402gal.com/) and trips
        // Xaman's "Invalid client/redirect URL" check.
        const pkce: any = new XummPkce(apiKey, {
          implicit: true,
          redirectUrl: window.location.origin,
        });
        pkceRef.current = pkce;

        pkce.on("error", (err: Error) => {
          setError(err?.message ?? "Xaman authorization error");
          setStatus("error");
        });
        pkce.on("success", async () => {
          const state = await pkce.state();
          await applyState(state);
        });
        pkce.on("retrieved", async () => {
          const state = await pkce.state();
          await applyState(state);
        });
        pkce.on("loggedout", () => {
          setAccount(null);
          setRlusd(null);
          setStatus("disconnected");
        });

        // Restore any existing session; otherwise mark disconnected.
        pkce
          .state()
          .then(async (state: { me?: { account?: string } } | null | undefined) => {
            if (cancelled) return;
            if (state?.me?.account) await applyState(state);
            else setStatus("disconnected");
          })
          .catch(() => {
            if (!cancelled) setStatus("disconnected");
          });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load Xaman SDK");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [applyState]);

  const connect = useCallback(async () => {
    if (!pkceRef.current) return;
    setError(null);
    setStatus("connecting");
    try {
      const resolved = await pkceRef.current.authorize();
      let state = resolved ?? (await pkceRef.current.state());

      // Fallback: the popup/QR flow can resolve the account a beat after
      // authorize() returns (especially cross-device QR sign-in). Poll state()
      // briefly so a slightly-delayed result still connects the header.
      for (let i = 0; i < 12 && !state?.me?.account; i++) {
        await new Promise((r) => setTimeout(r, 750));
        state = await pkceRef.current.state();
      }

      if (state?.me?.account) {
        await applyState(state);
      } else {
        // Don't get stuck on the spinner — drop back to a clickable button.
        setStatus("disconnected");
        setError(
          "Sign-in didn't return an account. If a popup was blocked, allow popups and retry. Make sure you're on the same domain that's whitelisted in Xaman (www vs non-www).",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xaman sign-in failed");
      setStatus("error");
    }
  }, [applyState]);

  const disconnect = useCallback(async () => {
    try {
      await pkceRef.current?.logout();
    } finally {
      sdkRef.current = null;
      setAccount(null);
      setRlusd(null);
      setStatus("disconnected");
    }
  }, []);

  const pushSignRequest = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (txjson: any, instruction?: string, userToken?: string | null) => {
    const sdk = sdkRef.current;
    if (!sdk) return null;
    const created = await sdk.payload.create({
      txjson,
      // user_token makes Xaman push the request to the user's device.
      user_token: userToken ?? undefined,
      options: { submit: false, expire: 5 },
      custom_meta: instruction ? { instruction } : undefined,
    });
    if (!created) return null;
    return {
      uuid: created.uuid as string,
      qrPng: created.refs?.qr_png ?? "",
      deeplink: created.next?.always ?? "",
      pushed: !!created.pushed,
    };
  }, []);

  const refreshBalance = useCallback(async () => {
    if (account) await fetchBalance(account);
  }, [account, fetchBalance]);

  return (
    <XamanContext.Provider
      value={{ status, account, rlusd, error, connect, disconnect, refreshBalance, pushSignRequest }}
    >
      {children}
    </XamanContext.Provider>
  );
}
