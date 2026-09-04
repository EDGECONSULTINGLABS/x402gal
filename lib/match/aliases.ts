import { METRO_CITIES } from "./metroCities";
import { METROS, metroById, type MetroId } from "./metros";

export type PlaceHit = {
  metroId: MetroId;
  label: string;
  lng: number;
  lat: number;
  note?: string;
};

const ALIASES: { keys: string[]; metroId: MetroId; note?: string }[] = [
  {
    keys: [
      "nyc",
      "new york city",
      "manhattan",
      "chelsea",
      "hudson yards",
      "midtown",
      "10001",
      "10011",
      "10018",
    ],
    metroId: "nyc",
    note: "That name sits in the New York metro. The pin is Chelsea, where the Summit is.",
  },
  {
    keys: [
      "ashburn",
      "loudoun",
      "sterling",
      "leesburg",
      "nova",
      "northern va",
      "n virginia",
      "us-east-1",
      "useast1",
      "iad",
      "20147",
      "20148",
      "20151",
      "20164",
      "20165",
      "20166",
    ],
    metroId: "nova",
    note: "That name sits in the Northern Virginia metro.",
  },
  {
    keys: ["phoenix", "phx", "tempe", "mesa", "chandler", "scottsdale", "goodyear", "85001", "85003", "85004", "85006", "85007", "85008", "85012", "85014", "85016", "85018", "85281", "85282"],
    metroId: "phoenix",
  },
  {
    keys: ["dallas", "dfw", "plano", "irving", "richardson", "75201", "75202", "75001", "75023", "75024", "75063"],
    metroId: "dallas",
  },
  {
    keys: ["columbus", "cbus", "43215", "43201", "43202", "43206", "43212", "43214", "43220"],
    metroId: "columbus",
  },
  {
    keys: ["hansel valley", "box elder", "great salt lake", "gsl", "stratos", "bitzero", "84336", "84337", "84302"],
    metroId: "utah",
    note: "That name sits in the Utah metro — Hansel Valley, north of the Great Salt Lake.",
  },
];

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(raw: string): string {
  return normalize(raw).replace(/\s/g, "");
}

/** Instant, local. No network. Metro center — not a named facility. */
export function matchAlias(raw: string): PlaceHit | null {
  const n = normalize(raw);
  const c = compact(raw);
  if (n.length < 2) return null;

  for (const metro of METROS) {
    const name = normalize(metro.name);
    if (n === name || n.startsWith(name) || name.startsWith(n)) {
      return {
        metroId: metro.id,
        label: `${metro.name} metro center`,
        lng: metro.center[0],
        lat: metro.center[1],
      };
    }
  }

  // Metro cities from the facility file ("Mesa", "mesa az", "Sterling, VA").
  const cityHits = cityMetros(n);
  if (cityHits.length === 1) {
    const metro = metroById(cityHits[0]);
    return {
      metroId: metro.id,
      label: `${metro.name} metro center`,
      lng: metro.center[0],
      lat: metro.center[1],
      note: `That city is in the ${metro.name} metro.`,
    };
  }

  for (const row of ALIASES) {
    if (
      row.keys.some(
        (k) => n === k || c === k.replace(/-/g, "") || (k.length >= 5 && n.includes(k))
      )
    ) {
      const metro = metroById(row.metroId);
      return {
        metroId: metro.id,
        label: `${metro.name} metro center`,
        lng: metro.center[0],
        lat: metro.center[1],
        note: row.note,
      };
    }
  }

  return matchClosest(n, c);
}

/** Metros whose city list contains the typed city, with or without a state suffix. */
function cityMetros(n: string): MetroId[] {
  const out: MetroId[] = [];
  for (const [id, m] of Object.entries(METRO_CITIES) as [MetroId, (typeof METRO_CITIES)[MetroId]][]) {
    const st = m.state.toLowerCase();
    const hit = m.cities.some((city) => {
      const k = normalize(city);
      return n === k || n === `${k} ${st}` || n === `${k} ${normalize(stateName(st))}`;
    });
    if (hit) out.push(id);
  }
  return out;
}

/** "Arlington" is in two metros. Say so instead of guessing. */
export function cityAmbiguity(raw: string): string | null {
  const hits = cityMetros(normalize(raw));
  if (hits.length < 2) return null;
  const names = hits.map((id) => `${metroById(id).name} (${METRO_CITIES[id].state})`).join(" or ");
  return `${raw.trim()} is in ${names}. Add the state.`;
}

function stateName(code: string): string {
  return (
    ({ ny: "new york", az: "arizona", va: "virginia", tx: "texas", oh: "ohio", ut: "utah" } as Record<string, string>)[code] ??
    code
  );
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) dp[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[rows - 1][cols - 1];
}

function matchClosest(n: string, c: string): PlaceHit | null {
  if (n.length < 4) return null;
  type Cand = { key: string; metroId: MetroId };
  const candidates: Cand[] = METROS.map((metro) => ({
    key: normalize(metro.name),
    metroId: metro.id,
  }));
  for (const row of ALIASES) {
    for (const key of row.keys) {
      if (key.length < 4 || /^\d+$/.test(key)) continue;
      candidates.push({ key: normalize(key), metroId: row.metroId });
    }
  }

  let best: Cand | null = null;
  let bestDistance = 3;
  const metrosAtBest = new Set<MetroId>();
  for (const cand of candidates) {
    const compactKey = cand.key.replace(/\s/g, "");
    const distance = Math.min(levenshtein(n, cand.key), levenshtein(c, compactKey));
    if (distance > 2) continue;
    if (distance < bestDistance) {
      best = cand;
      bestDistance = distance;
      metrosAtBest.clear();
      metrosAtBest.add(cand.metroId);
    } else if (distance === bestDistance) {
      metrosAtBest.add(cand.metroId);
    }
  }
  if (!best || metrosAtBest.size !== 1) return null;
  const metro = metroById(best.metroId);
  return {
    metroId: metro.id,
    label: `${metro.name} metro center`,
    lng: metro.center[0],
    lat: metro.center[1],
    note: `Showing ${metro.name} — closest match to what you typed.`,
  };
}

function metroList(): string {
  const names = METROS.map((m) => m.name);
  if (names.length < 2) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function outsideMetroDirection(): string {
  return `That place is outside ${metroList()}. Choose one of those, or type a city or zip inside them.`;
}

export function facilityNotFound(): string {
  return `No listed facility by that name in ${metroList()}. Try the operator's name, a city, or a zip — or choose a metro.`;
}

export function facilityListLoading(): string {
  return `The facility list is still loading. Choose a metro — that path is instant.`;
}
