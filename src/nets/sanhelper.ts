import { Chess } from 'chess.js'
import type { MaiaEvaluation } from "./types.js";

export interface SanMaiaEvaluation {
  value: number
  policy: Record<string, number>
}

interface LichessMove {
  uci: string
  san: string
  white: number
  draws: number
  black: number
}

export interface LichessData {
  white: number
  draws: number
  black: number
  moves: LichessMove[]
  opening?: { eco: string; name: string }
}

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

export const lichessToSanEval = (data: LichessData): SanMaiaEvaluation => {
  const total = data.white + data.draws + data.black
  const winRate =
    total > 0 ? (data.white + 0.5 * data.draws) / total : 0.5

  const policy: Record<string, number> = {}
  const moveTotal = data.moves.reduce(
    (s, m) => s + m.white + m.draws + m.black,
    0
  )

  for (const m of data.moves) {
    const games = m.white + m.draws + m.black
    policy[m.san] = moveTotal ? games / moveTotal : 0
  }

  return {
    value: (winRate - 0.5) * 2,
    policy,
  }
}
