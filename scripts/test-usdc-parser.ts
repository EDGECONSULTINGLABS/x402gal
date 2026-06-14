/**
 * Unit tests for usdcDecimalToMicros parser.
 *
 * Run with:
 *   npx tsx scripts/test-usdc-parser.ts
 *
 * Tests every edge case that can break money validation:
 *   - exact matches
 *   - fractional precision (padding, truncation rejection)
 *   - bare decimal (".5")
 *   - trailing dot ("1.")
 *   - scientific notation ("1e6")
 *   - negative numbers
 *   - over-precision (>6 decimals)
 *   - empty / bare dot / malformed
 */

// Inline the parser so this file is self-contained and runnable without
// pulling in the whole adapter (and its Redis imports).
function usdcDecimalToMicros(v: string): bigint {
  if (!v || v === ".") throw new Error("MALFORMED");
  if (/[eE]/.test(v)) throw new Error("SCIENTIFIC_NOTATION");
  const [whole, frac = ""] = v.split(".");
  if (frac.length > 6) throw new Error("AMOUNT_TOO_PRECISE");
  const sign = whole.startsWith("-") ? -1n : 1n;
  const absWhole = whole.replace(/^-/, "") || "0";
  return sign * (BigInt(absWhole) * 1_000_000n + BigInt(frac.padEnd(6, "0")));
}

interface Case {
  input: string;
  expect?: bigint;
  throws?: string;
}

const cases: Case[] = [
  // Exact matches
  { input: "0", expect: 0n },
  { input: "1", expect: 1_000_000n },
  { input: "1.0", expect: 1_000_000n },
  { input: "1.000000", expect: 1_000_000n },
  { input: "1.000001", expect: 1_000_001n },
  { input: "100.123456", expect: 100_123_456n },
  { input: "0.000001", expect: 1n },
  { input: "0.000000", expect: 0n },
  { input: "999999.999999", expect: 999_999_999_999n },

  // Negative
  { input: "-1", expect: -1_000_000n },
  { input: "-1.000001", expect: -1_000_001n },
  { input: "-0.5", expect: -500_000n },

  // Edge cases that should succeed
  { input: "1.", expect: 1_000_000n },        // trailing dot
  { input: ".5", expect: 500_000n },          // bare fractional part
  { input: "0.5", expect: 500_000n },         // explicit zero whole
  { input: "01.500000", expect: 1_500_000n }, // leading zero (BigInt handles)

  // Edge cases that should throw
  { input: "1.0000001", throws: "AMOUNT_TOO_PRECISE" },   // 7 decimal places
  { input: "1.1234567", throws: "AMOUNT_TOO_PRECISE" },   // 7 decimal places
  { input: "1e6", throws: "SCIENTIFIC_NOTATION" },        // scientific notation
  { input: "1E6", throws: "SCIENTIFIC_NOTATION" },        // uppercase
  { input: "1.2e3", throws: "SCIENTIFIC_NOTATION" },      // mixed
  { input: "", throws: "MALFORMED" },                     // empty string
  { input: ".", throws: "MALFORMED" },                    // bare dot
];

let testsPassed = 0;
let testsFailed = 0;

for (const c of cases) {
  if (c.throws) {
    try {
      usdcDecimalToMicros(c.input);
      console.error(`FAIL  "${c.input}" — expected to throw ${c.throws}, but succeeded`);
      testsFailed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === c.throws) {
        console.log(`PASS  "${c.input}" → throws ${msg}`);
        testsPassed++;
      } else {
        console.error(`FAIL  "${c.input}" — expected throw ${c.throws}, got ${msg}`);
        testsFailed++;
      }
    }
  } else if (c.expect !== undefined) {
    try {
      const result = usdcDecimalToMicros(c.input);
      if (result === c.expect) {
        console.log(`PASS  "${c.input}" → ${result}n`);
        testsPassed++;
      } else {
        console.error(`FAIL  "${c.input}" — expected ${c.expect}n, got ${result}n`);
        testsFailed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`FAIL  "${c.input}" — expected ${c.expect}n, threw ${msg}`);
      testsFailed++;
    }
  }
}

console.log(`\n${testsPassed} passed, ${testsFailed} failed`);
process.exit(testsFailed > 0 ? 1 : 0);
