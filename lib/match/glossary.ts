export type GlossaryId =
  | "watershed"
  | "huc12"
  | "aquifer"
  | "infiltration"
  | "stormwater"
  | "retirement"
  | "attestation";

export type GlossaryEntry = {
  id: GlossaryId;
  term: string;
  /** Final copy. Render as written. Do not paraphrase. */
  paragraphs: readonly string[];
  /** Watershed only — New York geofence. */
  nyParagraphs?: readonly string[];
};

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    id: "watershed",
    term: "watershed",
    paragraphs: [
      "An area of land where every drop of rain that falls drains toward the same place — a creek, then a river, then eventually the sea. You are always standing in one. Which one you are standing in decides where your stormwater goes and which body of water it ends up affecting.",
    ],
    nyParagraphs: [
      "New York City's drinking water does not come from New York City. Most of it comes from the Catskill and Delaware watersheds, more than a hundred miles upstate. The city chose to buy and protect that land rather than build a filtration plant, which is why it is one of the few large cities in the world that does not filter its surface water.",
    ],
  },
  {
    id: "huc12",
    term: "HUC12",
    paragraphs: [
      "A Hydrologic Unit Code is the number the US Geological Survey assigns to a watershed so it can be referred to exactly. The digit count tells you the scale: two digits covers a region the size of an entire river basin, twelve digits covers a local watershed of a few tens of square miles.",
      "HUC12 is the useful size here. It is small enough that a single infiltration project measurably changes what happens in it, and large enough to contain the facilities drawing water out of it.",
    ],
  },
  {
    id: "aquifer",
    term: "aquifer",
    paragraphs: [
      "An underground layer of rock, sand or gravel that holds water in the spaces between its grains. Wells pull water out of it; rain and snowmelt put water back in, but rarely at the same rate.",
      "Where withdrawal outpaces recharge for long enough, the water level falls, wells have to be drilled deeper, and in some regions the ground surface itself sinks. That is the gap infiltration is meant to narrow.",
    ],
  },
  {
    id: "infiltration",
    term: "infiltration",
    paragraphs: [
      "Water moving down from the surface into the soil instead of running across it. Pavement, roofs and compacted ground block that pathway, which is why cities flood in heavy rain and why the groundwater beneath them stops being replenished.",
      "Engineered infiltration deliberately restores the pathway, and instruments in the ground measure how much water actually goes down.",
    ],
  },
  {
    id: "stormwater",
    term: "stormwater",
    paragraphs: [
      "Rain that lands on a hard surface and runs off rather than soaking in. It picks up whatever is on that surface along the way and arrives at the nearest creek or storm drain fast, warm and dirty.",
      "Managing it is a legal obligation for most large property owners in the United States. That obligation is why the work has to happen; the measurement is what makes it countable.",
    ],
  },
  {
    id: "retirement",
    term: "retirement",
    paragraphs: [
      "Permanently removing a credit from circulation so that it cannot be counted a second time. The buyer keeps the claim to the outcome; the credit itself no longer exists to be sold.",
      "Retirement is the control that stops one environmental outcome being sold to several buyers — the failure that has damaged trust in other credit markets. Here it is recorded on a public ledger, so anyone can see that it happened and cannot be quietly reversed.",
    ],
  },
  {
    id: "attestation",
    term: "attestation",
    paragraphs: [
      "A licensed professional putting their name and their licence behind a statement, and being accountable for it. It is the same model used in financial audit: not a claim that any reader can recompute the result, but a record that a qualified person reviewed the work and signed it.",
      "Here a gallon passes through preparation by the site engineer, review by an independent professional engineer, and review by an independent accountant before it is recorded. The ledger shows that those reviews happened and that the documents have not changed since. It does not replace the reviewers.",
    ],
  },
];

export function glossaryById(id: GlossaryId): GlossaryEntry {
  const entry = GLOSSARY.find((g) => g.id === id);
  if (!entry) throw new Error(`unknown glossary id: ${id}`);
  return entry;
}
