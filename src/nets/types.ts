import { Chess } from "chess.js"
import NetModel from "./NetModel.js"

export type NetStatus =
  | 'loading'
  | 'no-cache'
  | 'downloading'
  | 'ready'
  | 'error'

export type ModelType = 'maia2' | 'bigLeela' | 'elitemaia'

export interface MaiaEngine {
  maia2?: NetModel
  bigLeela?: NetModel
  elitemaia?: NetModel
  status: Record<ModelType, NetStatus>
  progress: Record<ModelType, number>
  downloadModel: (modelType: ModelType) => Promise<void>
  activeModels: ModelType[]
}


export interface MaiaEvaluation {
  value: number
  policy: { [key: string]: number }
}

export const uciToSan = (uci: string, fen: string): string => {
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.substring(0, 2),
      to: uci.substring(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    return move ? move.san : uci;
  } catch {
    return uci;
  }
};
export type MoveCategory = 'brilliant' | 'tricky' | 'normal' | 'book';


export function getPolicyValue(evaluation: MaiaEvaluation, moveKey: string): number {
  return evaluation.policy[moveKey] ?? 0;
}