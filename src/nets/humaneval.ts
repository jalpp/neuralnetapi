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
 * returns a user friendly HEE eval or converted centipawn eval based on neural net's win probability
 * @param winProb the neural net win probability
 * @returns user friendly eval string
 */
export function evalText(winProb: number): string {
    const q = winProbToQ(winProb);
    const cp = qToCp(q);
    return (cp / 100) >= 0 ? `+${(cp / 100).toFixed(2)}` : (cp / 100).toFixed(2);
}