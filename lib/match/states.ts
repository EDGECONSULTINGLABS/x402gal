/**
 * The 50 states + DC with their US Census Bureau region and division. Used to answer
 * "how many data centers are in my state / my part of the country" without any network.
 */
export type CensusRegion = "Northeast" | "Midwest" | "South" | "West";
export type StateInfo = { code: string; name: string; region: CensusRegion; division: string };

export const STATES: readonly StateInfo[] = [
  { code: "CT", name: "Connecticut", region: "Northeast", division: "New England" },
  { code: "ME", name: "Maine", region: "Northeast", division: "New England" },
  { code: "MA", name: "Massachusetts", region: "Northeast", division: "New England" },
  { code: "NH", name: "New Hampshire", region: "Northeast", division: "New England" },
  { code: "RI", name: "Rhode Island", region: "Northeast", division: "New England" },
  { code: "VT", name: "Vermont", region: "Northeast", division: "New England" },
  { code: "NJ", name: "New Jersey", region: "Northeast", division: "Middle Atlantic" },
  { code: "NY", name: "New York", region: "Northeast", division: "Middle Atlantic" },
  { code: "PA", name: "Pennsylvania", region: "Northeast", division: "Middle Atlantic" },
  { code: "IL", name: "Illinois", region: "Midwest", division: "East North Central" },
  { code: "IN", name: "Indiana", region: "Midwest", division: "East North Central" },
  { code: "MI", name: "Michigan", region: "Midwest", division: "East North Central" },
  { code: "OH", name: "Ohio", region: "Midwest", division: "East North Central" },
  { code: "WI", name: "Wisconsin", region: "Midwest", division: "East North Central" },
  { code: "IA", name: "Iowa", region: "Midwest", division: "West North Central" },
  { code: "KS", name: "Kansas", region: "Midwest", division: "West North Central" },
  { code: "MN", name: "Minnesota", region: "Midwest", division: "West North Central" },
  { code: "MO", name: "Missouri", region: "Midwest", division: "West North Central" },
  { code: "NE", name: "Nebraska", region: "Midwest", division: "West North Central" },
  { code: "ND", name: "North Dakota", region: "Midwest", division: "West North Central" },
  { code: "SD", name: "South Dakota", region: "Midwest", division: "West North Central" },
  { code: "DE", name: "Delaware", region: "South", division: "South Atlantic" },
  { code: "DC", name: "District of Columbia", region: "South", division: "South Atlantic" },
  { code: "FL", name: "Florida", region: "South", division: "South Atlantic" },
  { code: "GA", name: "Georgia", region: "South", division: "South Atlantic" },
  { code: "MD", name: "Maryland", region: "South", division: "South Atlantic" },
  { code: "NC", name: "North Carolina", region: "South", division: "South Atlantic" },
  { code: "SC", name: "South Carolina", region: "South", division: "South Atlantic" },
  { code: "VA", name: "Virginia", region: "South", division: "South Atlantic" },
  { code: "WV", name: "West Virginia", region: "South", division: "South Atlantic" },
  { code: "AL", name: "Alabama", region: "South", division: "East South Central" },
  { code: "KY", name: "Kentucky", region: "South", division: "East South Central" },
  { code: "MS", name: "Mississippi", region: "South", division: "East South Central" },
  { code: "TN", name: "Tennessee", region: "South", division: "East South Central" },
  { code: "AR", name: "Arkansas", region: "South", division: "West South Central" },
  { code: "LA", name: "Louisiana", region: "South", division: "West South Central" },
  { code: "OK", name: "Oklahoma", region: "South", division: "West South Central" },
  { code: "TX", name: "Texas", region: "South", division: "West South Central" },
  { code: "AZ", name: "Arizona", region: "West", division: "Mountain" },
  { code: "CO", name: "Colorado", region: "West", division: "Mountain" },
  { code: "ID", name: "Idaho", region: "West", division: "Mountain" },
  { code: "MT", name: "Montana", region: "West", division: "Mountain" },
  { code: "NV", name: "Nevada", region: "West", division: "Mountain" },
  { code: "NM", name: "New Mexico", region: "West", division: "Mountain" },
  { code: "UT", name: "Utah", region: "West", division: "Mountain" },
  { code: "WY", name: "Wyoming", region: "West", division: "Mountain" },
  { code: "AK", name: "Alaska", region: "West", division: "Pacific" },
  { code: "CA", name: "California", region: "West", division: "Pacific" },
  { code: "HI", name: "Hawaii", region: "West", division: "Pacific" },
  { code: "OR", name: "Oregon", region: "West", division: "Pacific" },
  { code: "WA", name: "Washington", region: "West", division: "Pacific" },
];

const BY_CODE = new Map(STATES.map((s) => [s.code, s]));

export function stateByCode(code: string): StateInfo | null {
  return BY_CODE.get(code.toUpperCase()) ?? null;
}

export function statesInDivision(division: string): StateInfo[] {
  return STATES.filter((s) => s.division === division);
}

export function statesInRegion(region: CensusRegion): StateInfo[] {
  return STATES.filter((s) => s.region === region);
}

/** Alphabetical by name, for pickers. */
export const STATES_BY_NAME: readonly StateInfo[] = [...STATES].sort((a, b) => a.name.localeCompare(b.name));

export const HOME_STATE_KEY = "x402gal.summit.homeState";

export function readHomeState(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(HOME_STATE_KEY);
    return v && BY_CODE.has(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeHomeState(code: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (code) window.localStorage.setItem(HOME_STATE_KEY, code);
    else window.localStorage.removeItem(HOME_STATE_KEY);
  } catch {
    /* private mode */
  }
}
