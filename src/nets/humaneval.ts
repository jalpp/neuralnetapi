import { rawWdl } from "./tensorMaia3.js";

/**
 * Converts a neural net win probability [0, 1] to Q in [-1, 1].
 * All models return value in [0, 1] (white win probability).
 * Q = winProb * 2 - 1  →  0 = equal, +1 = white wins, -1 = black wins.
 * @param winProb the win probability
 * @returns the bounded equal value
 */
export function winProbToQ(winProb: number): number {
  return winProb * 2 - 1;
}

/**
 * Converts a Q value ([-1, 1], white-relative) to centipawns using the
 * inverse of the Lichess win probability sigmoid:
 *   Q(cp) = 2 / (1 + e^(-0.00368208 * cp)) - 1
 *
 * Solving for cp:
 *   cp = ln((1 - Q) / (1 + Q)) / -0.00368208
 * @param q the Q score value
 * @returns the centi pawn cp
 */
export function qToCp(q: number): number {
  const MULTIPLIER = -0.00368208;
  // Clamp to avoid ±Infinity at the boundaries
  const clamped = Math.max(-0.9999, Math.min(0.9999, q));
  return Math.log((1 - clamped) / (1 + clamped)) / MULTIPLIER;
}

/**
 * returns user friendly eval format
 * @param cp the centi pawn
 * @returns the string
 */
export function evalFormatter(cp: number): string {
  return (cp / 100) >= 0 ? `+${(cp / 100).toFixed(2)}` : (cp / 100).toFixed(2);
}

/**
 * returns a user friendly HEE eval or converted centipawn eval based on neural net's win probability
 * @param winProb the neural net win probability
 * @returns user friendly eval string
 */
export function evalText(winProb: number): string {
    const q = winProbToQ(winProb);
    const cp = qToCp(q);
    return evalFormatter(cp);
}

/**
 * Lc0EE (Leela Chess Zero Estimated Eval):
 * Converts raw WDL probabilities to centipawns using the inversion of the
 * logistic WDL model used by both Stockfish and Lc0.
 *
 *   a = ln(1/L - 1)
 *   b = ln(1/W - 1)
 *   centipawn = 100 * (a - b) / (a + b)
 *
 * Property: 50% W = +1.00 pawn (100 cp).
 * Returns null if WDL is numerically too extreme.
 */
export function wdlToLc0Cp(wdl: rawWdl): number | null {
  const { win: W, draw: D, loss: L } = wdl;
  const eps = 0.0001;
  if (
    W <= eps || D <= eps || L <= eps ||
    W >= 1 - eps || D >= 1 - eps || L >= 1 - eps
  ) {
    return null;
  }
  const a = Math.log(1 / L - 1);
  const b = Math.log(1 / W - 1);
  const denom = a + b;
  if (Math.abs(denom) < 1e-9) return 0;
  return 100 * (a - b) / denom;
}

/**
 * returns lc0's eval based on raw WDL
 * @param wdl 
 * @returns 
 */
export function lc0EvalText(wdl: rawWdl): string {
  const cp = wdlToLc0Cp(wdl);
  return evalFormatter(cp ?? 0.5);
}