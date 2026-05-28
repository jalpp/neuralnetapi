import { Chess } from 'chess.js'
import type { MaiaEvaluation, SanMaiaEvaluation } from "./types.js";

const uciToSan = (uci: string, fen: string): string => {
  try {
    const chess = new Chess(fen)
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] as any,
    })
    return move?.san ?? uci
  } catch {
    return uci
  }
}

export const uciEvalToSan = (
  evalUci: MaiaEvaluation,
  fen: string
): SanMaiaEvaluation => {
  const policy: Record<string, number> = {}
  for (const [uci, p] of Object.entries(evalUci.policy)) {
    policy[uciToSan(uci, fen)] = p
  }
  return { value: evalUci.value, policy }
}

export const applyUciMove = (uci: string, fen: string): string | null => {
  try {
    const chess = new Chess(fen)
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] as any,
    })
    return move ? chess.fen() : null
  } catch {
    return null
  }
}
