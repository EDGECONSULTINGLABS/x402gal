/**
 * The Summit assessment — three taps, a water-to-water result, a map handoff.
 *
 * Coefficients live HERE and only here, on top of the x402GAL footprint model
 * (lib/footprint.ts — Green Grid WUE, boundary-aware, hashed). Nothing from a
 * third-party paper is typed into the UI. Until the methodology owner signs off
 * on the bucket values below, the version label reads "v1.0-draft" and the
 * estimate is rounded to one significant figure.
 *
 * Tone rule: never scold. No "heavy user". The person taking it is the buyer.
 */
import { calculateFootprint, FOOTPRINT_METHODOLOGY_HASH } from "../footprint";
import type { MetroId } from "./metros";

export const METHODOLOGY_NAME = "x402GAL Water Intensity Methodology";
export const METHODOLOGY_VERSION = "v1.0-draft";
export const METHODOLOGY_HASH = FOOTPRINT_METHODOLOGY_HASH;
/** Estimate is rounded to this many significant figures while the version is a draft. */
export const SIGNIFICANT_FIGURES = 1;

export type UsageBucket = "few" | "steady" | "workflow" | "agents";
export type MediaBucket = "rarely" | "sometimes" | "regularly";
export type BasedIn = MetroId | "elsewhere";

/** Q1 — text use per day, expressed as tokens in/out. Draft values. */
export const USAGE: Record<UsageBucket, { label: string; tokensIn: number; tokensOut: number }> = {
  few: { label: "A few prompts", tokensIn: 2_000, tokensOut: 4_000 },
  steady: { label: "Steadily through the day", tokensIn: 10_000, tokensOut: 20_000 },
  workflow: { label: "It runs my workflow", tokensIn: 40_000, tokensOut: 80_000 },
  agents: { label: "I run agents or automations", tokensIn: 200_000, tokensOut: 400_000 },
};

/** Q2 — images or video per day, as fixed IT energy per day. Draft values. */
export const MEDIA: Record<MediaBucket, { label: string; itemsPerDay: number }> = {
  rarely: { label: "Rarely", itemsPerDay: 0.5 },
  sometimes: { label: "Sometimes", itemsPerDay: 5 },
  regularly: { label: "Regularly", itemsPerDay: 25 },
};
/** IT energy per generated image, kWh. Draft value. */
export const KWH_PER_IMAGE = 0.003;

export const LITERS_PER_GALLON = 3.785411784;
export const BOTTLE_ML = 500;

export type AssessmentAnswers = {
  usage: UsageBucket;
  media: MediaBucket;
  basedIn: BasedIn;
};

export type AssessmentResult = {
  /** Site water per day, litres, before rounding. */
  litersPerDay: number;
  gallonsPerDay: number;
  bottlesPerDay: number;
  gallonsPerYear: number;
  bottlesPerYear: number;
  /** Rounded for display while the methodology is a draft. */
  dailyDisplay: string;
  gallonsPerYearDisplay: string;
  bottlesPerYearDisplay: string;
  methodology: { name: string; version: string; hash: string; formula: string };
  /** Metro whose representative facility the map hands off to. */
  metro: MetroId;
};

function roundSig(n: number, sig: number): number {
  if (!Number.isFinite(n) || n === 0) return 0;
  const p = Math.pow(10, sig - 1 - Math.floor(Math.log10(Math.abs(n))));
  return Math.round(n * p) / p;
}

function fmt(n: number): string {
  if (n === 0) return "0";
  if (n < 1) return String(Number(n.toPrecision(SIGNIFICANT_FIGURES)));
  return roundSig(n, SIGNIFICANT_FIGURES).toLocaleString("en-US");
}

/** Daily volume in the unit a person can picture: millilitres, then litres. */
function fmtDaily(liters: number): string {
  const ml = liters * 1000;
  if (ml < 1) return "under 1 mL";
  if (ml < 1000) return `${fmt(ml)} mL`;
  return `${fmt(liters)} L`;
}

/** "Elsewhere" hands off to the venue metro. Nearest known metro to where they are standing. */
export const ELSEWHERE_METRO: MetroId = "nyc";

export function assess(answers: AssessmentAnswers): AssessmentResult {
  const u = USAGE[answers.usage];
  const m = MEDIA[answers.media];
  const fp = calculateFootprint({
    tokens_in: u.tokensIn,
    tokens_out: u.tokensOut,
    e_overhead_kwh: m.itemsPerDay * KWH_PER_IMAGE,
    mode: "site",
  });
  const liters = fp.water_l;
  const gallons = liters / LITERS_PER_GALLON;
  const bottles = (liters * 1000) / BOTTLE_ML;
  return {
    litersPerDay: liters,
    gallonsPerDay: gallons,
    bottlesPerDay: bottles,
    gallonsPerYear: gallons * 365,
    bottlesPerYear: bottles * 365,
    dailyDisplay: fmtDaily(liters),
    gallonsPerYearDisplay: fmt(gallons * 365),
    bottlesPerYearDisplay: fmt(bottles * 365),
    methodology: {
      name: METHODOLOGY_NAME,
      version: METHODOLOGY_VERSION,
      hash: fp.methodology.methodology_hash,
      formula: fp.methodology.formula,
    },
    metro: answers.basedIn === "elsewhere" ? ELSEWHERE_METRO : answers.basedIn,
  };
}

/** Exact label from the spec §8. Render as written. */
export const ESTIMATE_LABEL = `Estimated under the ${METHODOLOGY_NAME} ${METHODOLOGY_VERSION}. This is an estimate from published coefficients, not a measurement.`;
