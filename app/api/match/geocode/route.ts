import { NextResponse } from "next/server";
import { METROS, metroForPoint } from "@/lib/match/metros";

export const dynamic = "force-dynamic";

type CensusMatch = {
  matchedAddress?: string;
  coordinates?: { x: number; y: number };
};

/**
 * Typed-address geocode, restricted to the Summit metros.
 * Census Bureau public geocoder — no key. Not a national facility search.
 */
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (address.length < 3) {
    return NextResponse.json({ error: "Enter a street address or place name." }, { status: 400 });
  }

  const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
  url.searchParams.set("address", address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json({ error: "Geocoder is unavailable." }, { status: 502 });
  }

  const payload = (await res.json()) as {
    result?: { addressMatches?: CensusMatch[] };
  };
  const matches = payload.result?.addressMatches ?? [];
  const inMetro = matches
    .map((m) => {
      const lng = m.coordinates?.x;
      const lat = m.coordinates?.y;
      if (typeof lng !== "number" || typeof lat !== "number") return null;
      const metro = metroForPoint(lng, lat);
      if (!metro) return null;
      return {
        lng,
        lat,
        label: m.matchedAddress ?? address,
        metroId: metro.id,
        metroName: metro.name,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  if (!inMetro.length) {
    const names = METROS.map((m) => m.name).join(", ");
    return NextResponse.json({
      results: [],
      message: `No match inside the demo metros (${names}). National search is out of scope.`,
    });
  }

  return NextResponse.json({ results: inMetro });
}
