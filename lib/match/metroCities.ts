import type { MetroId } from "./metros";

/**
 * Metro membership for the facility file (city + state code) and for typed input.
 * From the launch spec §4. Extend as needed; keep city names as they appear in the file.
 */
export type MetroMembership = {
  state: string;
  cities: readonly string[];
  /** Secondary filter: values of the file's "Market" column that mean this metro. */
  markets: readonly string[];
};

export const METRO_CITIES: Record<MetroId, MetroMembership> = {
  nyc: {
    state: "NY",
    cities: ["New York", "Manhattan"],
    markets: ["New York", "New York City", "Manhattan"],
  },
  phoenix: {
    state: "AZ",
    cities: ["Phoenix", "Mesa", "Chandler", "Tempe", "Scottsdale", "Goodyear", "Glendale", "Gilbert", "Avondale"],
    markets: ["Phoenix"],
  },
  nova: {
    state: "VA",
    cities: [
      "Ashburn", "Sterling", "Herndon", "Reston", "Manassas", "Chantilly", "Leesburg", "Dulles",
      "Vienna", "Arlington", "Alexandria", "Centreville", "Haymarket", "Gainesville", "Culpeper",
    ],
    markets: ["Northern Virginia", "Ashburn", "Loudoun", "Washington DC", "Washington, DC"],
  },
  dallas: {
    state: "TX",
    cities: [
      "Dallas", "Fort Worth", "Plano", "Irving", "Richardson", "Garland", "Carrollton", "Lewisville",
      "Allen", "Frisco", "Arlington", "Mesquite", "Grand Prairie", "Denton", "Farmers Branch",
    ],
    markets: ["Dallas", "Dallas-Fort Worth", "Dallas/Fort Worth", "DFW"],
  },
  columbus: {
    state: "OH",
    cities: ["Columbus", "Dublin", "New Albany", "Hilliard", "Westerville", "Gahanna", "Grove City", "Delaware", "Johnstown"],
    markets: ["Columbus"],
  },
  utah: {
    state: "UT",
    /**
     * The workbook's own "Salt Lake City" and "Ogden" markets (8 Sep 2026 review): Snowville — where
     * the Stratos row is filed — down through Ogden, Salt Lake City and its suburbs to Provo. The
     * workbook's Orem, Santaquin, Delta, Cedar City and St. George markets are not this metro.
     */
    cities: [
      "Snowville",
      "Hansel Valley",
      "Tremonton",
      "Brigham City",
      "Corinne",
      "Howell",
      "Ogden",
      "Salt Lake City",
      "West Valley City",
      "West Jordan",
      "South Jordan",
      "Midvale",
      "Draper",
      "Bluffdale",
      "Sandy",
      "Murray",
      "Fairfield",
      "Provo",
    ],
    markets: ["Box Elder", "Box Elder County", "Northern Utah", "Salt Lake City", "Salt Lake", "Ogden"],
  },
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Metro for a (city, stateCode, market) triple from the facility file, or null. */
export function metroForCity(city: string, stateCode: string, market = ""): MetroId | null {
  const c = norm(city);
  const st = stateCode.trim().toUpperCase();
  const mk = norm(market);
  for (const [id, m] of Object.entries(METRO_CITIES) as [MetroId, MetroMembership][]) {
    if (m.state !== st) continue;
    if (m.cities.some((x) => norm(x) === c)) return id;
    if (mk && m.markets.some((x) => norm(x) === mk)) return id;
  }
  return null;
}
