/**
 * The lines the water surface says, and the one number they depend on.
 * Copy lives here, next to the methodology, so the toy and the assessment cannot disagree.
 * Tone rule as everywhere in the instrument: never scold.
 */
import { calculateFootprint } from "../footprint";

/**
 * Cooling water for one prompt, millilitres, site boundary — the same model and boundary the
 * assessment reports. One prompt is taken as a fifth of the "a few prompts" bucket
 * (USAGE.few = 2,000 in / 4,000 out per day): 400 tokens in, 800 out.
 */
export const ML_PER_PROMPT: number =
  calculateFootprint({ tokens_in: 400, tokens_out: 800, e_overhead_kwh: 0, mode: "site" }).water_l * 1000;

export function fmtMl(ml: number): string {
  if (ml < 0.1) return "a fraction of a millilitre";
  return ml >= 10 ? `${Math.round(ml)} mL` : `${ml.toFixed(1)} mL`;
}

export type SurfaceFactId = "first" | "ten" | "forty" | "hundred" | "overdraft" | "recovered" | "heat";

/** Taps before a spot on the surface reads as overdrawn. */
export const OVERDRAFT_TAPS = 4;

export const SURFACE_FACTS: Record<SurfaceFactId, string> = {
  first: "Each tap is one prompt to an AI. The rings are the ask. What moves underneath is the water it is cooled with.",
  ten: `Ten prompts, about ${fmtMl(10 * ML_PER_PROMPT)} of cooling water at the data center. A teaspoon holds 5 mL.`,
  forty: `Forty prompts is a steady day of AI use — about ${fmtMl(40 * ML_PER_PROMPT)}. Small per person. There are a billion people doing it.`,
  hundred: "One hundred. The point is not the drops. It is that every one came from a real watershed with a name, and that name is on the next screen.",
  overdraft: "Draw from one place faster than it refills and the surface drops. That is an aquifer in overdraft — Phoenix and Dallas both pump from one.",
  recovered: "Left alone, the surface came back. Recharge is slow — that is the whole problem, and the reason the record has to be permanent.",
  heat: "Hold your finger there and everything gathers under it. Water moves toward heat — data centers are heat. That is the whole reason they need it.",
};
