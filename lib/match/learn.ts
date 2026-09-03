import type { GlossaryId } from "./glossary";

/**
 * The learn sequence — one screen, one idea, two minutes total.
 * Glossary terms are tapped in place (GlossaryTerm); this is the connective copy.
 * Claim discipline: supply measured, demand estimated, nothing minted, nothing for sale.
 */
export type LearnStep = {
  id: string;
  title: string;
  body: readonly string[];
  /** Glossary terms to offer under the copy. */
  terms: readonly GlossaryId[];
};

export const LEARN_STEPS: readonly LearnStep[] = [
  {
    id: "watershed",
    title: "You are standing in a watershed",
    body: [
      "Every drop of rain that lands here drains to the same creek, then the same river. The boundary you saw drawn on the map is that area, as surveyed by the US Geological Survey.",
      "A data center sits inside one too. Its cooling water comes from that ground and goes back to that ground, warmer.",
    ],
    terms: ["watershed", "huc12"],
  },
  {
    id: "where-it-goes",
    title: "Where the water goes",
    body: [
      "Pavement and roofs stop rain from soaking in. It runs off fast, warm and dirty, and the aquifer beneath is not refilled.",
      "Engineered infiltration puts that pathway back. Instruments in the ground measure how much water actually goes down.",
    ],
    terms: ["stormwater", "infiltration", "aquifer"],
  },
  {
    id: "a-gallon",
    title: "What a verified gallon is",
    body: [
      "Not a model. A measured volume of water that went into the ground, prepared by the site engineer, reviewed by an independent professional engineer, and reviewed by an independent accountant before it is recorded.",
      "Your assessment result was an estimate from coefficients. A verified gallon is a measurement. The app keeps those two kinds of number apart on purpose.",
    ],
    terms: ["attestation"],
  },
  {
    id: "retirement",
    title: "Why retirement matters",
    body: [
      "When a buyer claims a gallon, the record is retired — permanently removed so it cannot be counted twice. That is the control other credit markets lacked.",
      "HydroCoin is the accounting layer for that record. Nothing is minted or for sale here today; what you can do is find your watershed and find one of us on the floor.",
    ],
    terms: ["retirement"],
  },
];
