import { Tensor } from "onnxruntime-node"
import { allPossibleMovesReversed, allPossibleMovesReversedMaia, mirrorMove } from "./tensor.js"
import { rawWdl, SideWdl } from "./types.js"
import { EngineAnalysis, MoveProbability, WdlMaps } from "./types.js"
import { applyUciMove } from "./sanhelper.js"
import { Maia3Model } from "./Maia3Model.js"
import { Chess } from "chess.js"
import { LeelaModel } from "./LeelaModel.js"

export function pickOutput(
  outputs: Record<string, Tensor>,
  names: string[],
): Tensor {
  for (const n of names) if (outputs[n]) return outputs[n]
  throw new Error(`Missing output: ${names.join(', ')}`)
}

export function wdlToWinProb(wdl: Tensor, fen: string): { winProb: number; rawWdl: rawWdl } {
  const data = wdl.data as Float32Array

  const max = Math.max(...data)
  const exp = Array.from(data).map((v) => Math.exp(v - max))
  const sum = exp.reduce((a, b) => a + b, 0)
  const probs = exp.map((v) => v / sum)

  const draw = probs[1]
  const whiteWin = probs[2]
  const whiteLoss = probs[0]

  const whiteWinProb = whiteWin + 0.5 * draw
  const isBlack = fen.split(' ')[1] === 'b'

  const rawWdl: rawWdl = {
    win:  isBlack ? whiteLoss : whiteWin,
    loss: isBlack ? whiteWin  : whiteLoss,
    draw,
    whiteWdl: { win: whiteWin,  draw, loss: whiteLoss },
    blackWdl: { win: whiteLoss, draw, loss: whiteWin  },
  }

  return {
    winProb: isBlack ? 1 - whiteWinProb : whiteWinProb,
    rawWdl,
  }
}

export function processLeelaPolicy(
  fen: string,
  logitsTensor: Tensor,
  legalMoves: Float32Array,
): Record<string, number> {
  const logits = logitsTensor.data as Float32Array
  const isBlack = fen.split(' ')[1] === 'b'

  const legalIndices: number[] = []
  for (let i = 0; i < legalMoves.length; i++) {
    if (legalMoves[i] > 0) {
      legalIndices.push(i)
    }
  }

  const moves = legalIndices.map((i) => {
    const move = allPossibleMovesReversed[i]
    return isBlack ? mirrorMove(move) : move
  })

  const legalLogits = legalIndices.map((i) => logits[i])
  const max = Math.max(...legalLogits)
  const exp = legalLogits.map((v) => Math.exp(v - max))
  const sum = exp.reduce((a, b) => a + b, 0)

  const policy: Record<string, number> = {}
  for (let i = 0; i < moves.length; i++) {
    policy[moves[i]] = exp[i] / sum
  }

  return policy
}

export function processMaiaPolicy(
  fen: string,
  policyTensor: Tensor,
  valueTensor: Tensor,
  legalMoves: Float32Array,
) {
  const logits = policyTensor.data as Float32Array
  const value = valueTensor.data as Float32Array

  let winProb = Math.min(Math.max((value[0] as number) / 2 + 0.5, 0), 1)

  let black_flag = false
  if (fen.split(' ')[1] === 'b') {
    black_flag = true
    winProb = 1 - winProb
  }

  winProb = Math.round(winProb * 10000) / 10000

  const legalMoveIndices = legalMoves
    .map((value, index) => (value > 0 ? index : -1))
    .filter((index) => index !== -1)

  const legalMovesMirrored = []
  for (const moveIndex of legalMoveIndices) {
    const move = allPossibleMovesReversedMaia[moveIndex]
    if (!move) {
      console.warn(`Move index ${moveIndex} not found in allPossibleMovesReversedMaia`)
      continue
    }
    if (black_flag) {
      legalMovesMirrored.push(mirrorMove(move))
    } else {
      legalMovesMirrored.push(move)
    }
  }

  const legalLogits = []
  for (let i = 0; i < legalMoveIndices.length; i++) {
    if (i < legalMovesMirrored.length) {
      legalLogits.push(logits[legalMoveIndices[i]])
    }
  }

  if (legalLogits.length === 0) {
    console.error('No valid legal moves found for position:', fen)
    return { policy: {}, value: winProb }
  }

  const maxLogit = Math.max(...legalLogits)
  const expLogits = legalLogits.map((logit) => Math.exp(logit - maxLogit))
  const sumExp = expLogits.reduce((a, b) => a + b, 0)
  const probs = expLogits.map((expLogit) => expLogit / sumExp)

  const moveProbs: Record<string, number> = {}
  for (let i = 0; i < legalMovesMirrored.length; i++) {
    moveProbs[legalMovesMirrored[i]] = probs[i]
  }

  const sortedMoveProbs = Object.keys(moveProbs)
    .sort((a, b) => moveProbs[b] - moveProbs[a])
    .reduce(
      (acc, key) => {
        acc[key] = moveProbs[key]
        return acc
      },
      {} as Record<string, number>,
    )

  return { policy: sortedMoveProbs, value: winProb }
}

function emptyWdlMaps(): WdlMaps {
  return { wdlMap: new Map(), whiteWdlMap: new Map(), blackWdlMap: new Map() };
}

function toPercentageString(probability: number): string {
  return `${Math.ceil(probability * 100)}%`;
}

export function extractTopMoves(policy: Record<string, number>, limit = 5): MoveProbability[] {
  return Object.entries(policy)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([move, probability]) => ({ move, probability, percentage: toPercentageString(probability) }));
}

export function attachMoveWdl(topMoves: MoveProbability[], maps: WdlMaps): MoveProbability[] {
  return topMoves.map((m) => ({
    ...m,
    ...(maps.wdlMap.get(m.move)      ? { wdl:      maps.wdlMap.get(m.move)      } : {}),
    ...(maps.whiteWdlMap.get(m.move) ? { whiteWdl: maps.whiteWdlMap.get(m.move) } : {}),
    ...(maps.blackWdlMap.get(m.move) ? { blackWdl: maps.blackWdlMap.get(m.move) } : {}),
  }));
}

export function buildSanToUci(uciPolicy: Record<string, number>, fen: string): Map<string, string> {
  const sanToUci = new Map<string, string>();
  for (const uci of Object.keys(uciPolicy)) {
    try {
      const chess = new Chess(fen);
      const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as any });
      if (m) sanToUci.set(m.san, uci);
    } catch { /* skip invalid */ }
  }
  return sanToUci;
}

export function fillWdlMaps(
  validMoves: { san: string }[],
  results: { rawWdl?: { loss: number; draw: number; win: number; whiteWdl: SideWdl; blackWdl: SideWdl } | null }[],
  maps: WdlMaps,
) {
  for (let i = 0; i < validMoves.length; i++) {
    const opp = results[i].rawWdl;
    if (!opp) continue;
    maps.wdlMap.set(validMoves[i].san,      { win: opp.loss, draw: opp.draw, loss: opp.win });
    maps.whiteWdlMap.set(validMoves[i].san, opp.whiteWdl);
    maps.blackWdlMap.set(validMoves[i].san, opp.blackWdl);
  }
}

export async function computePerMoveWdlMaia3(
  topMovesSan: string[],
  uciPolicy: Record<string, number>,
  fen: string,
  rating: number,
  maia3Model: Maia3Model,
): Promise<WdlMaps> {
  const sanToUci = buildSanToUci(uciPolicy, fen);
  const validMoves: { san: string; resultFen: string }[] = [];

  for (const san of topMovesSan) {
    const uci = sanToUci.get(san);
    if (!uci) continue;
    const resultFen = applyUciMove(uci, fen);
    if (resultFen) validMoves.push({ san, resultFen });
  }

  if (validMoves.length === 0) return emptyWdlMaps();

  const results = await maia3Model.batchEvaluate(
    validMoves.map(({ resultFen }) => ({ fen: resultFen, eloSelf: rating, eloOppo: rating })),
  );

  const maps = emptyWdlMaps();
  fillWdlMaps(validMoves, results, maps);
  return maps;
}

export async function computePerMoveWdlLeela(
  topMovesSan: string[],
  uciPolicy: Record<string, number>,
  fen: string,
  leelaModel: LeelaModel,
): Promise<WdlMaps> {
  const sanToUci = buildSanToUci(uciPolicy, fen);
  const validMoves: { san: string; resultFen: string }[] = [];

  for (const san of topMovesSan) {
    const uci = sanToUci.get(san);
    if (!uci) continue;
    const resultFen = applyUciMove(uci, fen);
    if (resultFen) validMoves.push({ san, resultFen });
  }

  if (validMoves.length === 0) return emptyWdlMaps();

  const results = await leelaModel.batchEval(validMoves.map(({ resultFen }) => ({ fen: resultFen })));

  const maps = emptyWdlMaps();
  fillWdlMaps(validMoves, results, maps);
  return maps;
}

export function hasPerMoveWdl(entry: EngineAnalysis): boolean {
  return (
    entry.topMoves.length > 0 &&
    entry.topMoves.every((m) => m.wdl !== undefined && m.whiteWdl !== undefined && m.blackWdl !== undefined)
  );
}
