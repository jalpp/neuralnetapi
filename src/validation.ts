import { validateFen as chessjsValidateFen } from "chess.js";

export const MAIA3_RATING_MIN = 600;
export const MAIA3_RATING_MAX = 2600;

// All 21 canonical Maia3 rating levels (every 100 from 600–2600)
export const MAIA3_ALL_LEVELS: number[] = Array.from(
  { length: 21 },
  (_, i) => 600 + i * 100,
);

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validates a FEN string structurally and legally via chess.js.
 * Returns a typed result rather than throwing.
 */
export function validateFen(fen: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof fen !== "string" || fen.trim() === "") {
    errors.push({ field: "fen", message: "FEN must be a non-empty string." });
    return { valid: false, errors };
  }

  // chess.js validateFen() returns { ok, error }
  const check = chessjsValidateFen(fen.trim());
  if (!check.ok) {
    errors.push({
      field: "fen",
      message: `Invalid FEN: ${check.error ?? "unknown error"}`,
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates the `engine` field.
 * Allowed values: maia3 | maia2 | leela | elite-leela
 */
export function validateEngine(engine: unknown): ValidationResult {
  const VALID_ENGINES = ["maia3", "maia2", "leela", "elite-leela"] as const;
  const errors: ValidationError[] = [];

  if (typeof engine !== "string" || engine.trim() === "") {
    errors.push({
      field: "engine",
      message: "Engine must be a non-empty string.",
    });
    return { valid: false, errors };
  }

  if (!VALID_ENGINES.includes(engine as (typeof VALID_ENGINES)[number])) {
    errors.push({
      field: "engine",
      message: `Engine "${engine}" is not supported. Valid options: ${VALID_ENGINES.join(", ")}.`,
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates the `rating` field for Maia3/Maia2 engines.
 * Must be an integer in [600, 2600].
 */
export function validateMaiaRating(rating: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (rating === undefined || rating === null) {
    errors.push({
      field: "rating",
      message: `Rating is required for maia3/maia2 and must be an integer between ${MAIA3_RATING_MIN} and ${MAIA3_RATING_MAX}.`,
    });
    return { valid: false, errors };
  }

  const num = Number(rating);

  if (!Number.isInteger(num)) {
    errors.push({
      field: "rating",
      message: "Rating must be an integer.",
    });
    return { valid: false, errors };
  }

  if (num < MAIA3_RATING_MIN || num > MAIA3_RATING_MAX) {
    errors.push({
      field: "rating",
      message: `Rating ${num} is out of range. Must be between ${MAIA3_RATING_MIN} and ${MAIA3_RATING_MAX}.`,
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Collects all validation errors across the provided fields and returns
 * a combined result.  Caller decides which validators to run based on engine.
 */
export function combineValidations(
  ...results: ValidationResult[]
): ValidationResult {
  const allErrors = results.flatMap((r) => r.errors);
  return { valid: allErrors.length === 0, errors: allErrors };
}