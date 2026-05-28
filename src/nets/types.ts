import { Timestamp } from "@google-cloud/firestore";

export interface SideWdl {
  win: number;
  draw: number;
  loss: number;
}

export interface rawWdl {
  win: number;
  loss: number;
  draw: number;
  whiteWdl: SideWdl;
  blackWdl: SideWdl;
}

export type NetName = "leela" | "elite_leela" | `maia3_${number}`;

export interface MoveProbability {
  move: string;
  probability: number;
  percentage: string;
  wdl?: SideWdl;
  whiteWdl?: SideWdl;
  blackWdl?: SideWdl;
}

export interface EngineAnalysis {
  topMoves: MoveProbability[];
  inBook?: boolean;
  uciEval?: MaiaEvaluation;
  maiaRating?: number;
  HumanEstimateEval?: string;
  estimatedConvertedEval?: string;
  LeelaZeroEstimateEval?: string;
  cacheHit?: boolean;
  _fen?: string;
  _net?: NetName;
  _createdAt?: Timestamp;
  _schemaVersion?: number;
}

export type WdlMaps = {
  wdlMap: Map<string, SideWdl>;
  whiteWdlMap: Map<string, SideWdl>;
  blackWdlMap: Map<string, SideWdl>;
};


export interface MaiaEvaluation {
  value: number
  policy: { [key: string]: number }
  rawWdl?: rawWdl
}

export interface SanMaiaEvaluation {
  value: number
  policy: Record<string, number>
}


