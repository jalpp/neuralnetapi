import { Timestamp } from "@google-cloud/firestore";
import { Chess } from "chess.js";
import { LeelaModel } from "./LeelaModel.js";
import { Maia3Model } from "./Maia3Model.js";
import { evalText, lc0EvalText } from "./humaneval.js";
import { getCached, putCached, getBatchCached, putBatchCached } from "./cache.js";
import { uciEvalToSan, applyUciMove } from "./sanhelper.js";
import { SideWdl } from "./tensorMaia3.js";
import { MaiaEvaluation } from "./types.js";
import { MAIA3_ALL_LEVELS } from "../validation.js";

const DISABLE_CACHE =
  process.env.DISABLE_CACHE?.toLowerCase() === "true" || process.argv.includes("dev");

const MAIA_THREE_PATH = DISABLE_CACHE ? "./models/maia3_simplified.onnx" : process.env.MAIA_THREE_PATH;
const LEELA_PATH = DISABLE_CACHE ? "./models/t1-256x10.onnx" : process.env.LEELA_MODEL_PATH;
const ELITE_LEELA_PATH = DISABLE_CACHE ? "./models/eliteleelav2.onnx" : process.env.ELITE_LEELA_MODEL_PATH;

export const CACHE_SCHEMA_VERSION = 1;

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

type WdlMaps = {
  wdlMap: Map<string, SideWdl>;
  whiteWdlMap: Map<string, SideWdl>;
  blackWdlMap: Map<string, SideWdl>;
};

function emptyWdlMaps(): WdlMaps {
  return { wdlMap: new Map(), whiteWdlMap: new Map(), blackWdlMap: new Map() };
}

function toPercentageString(probability: number): string {
  return `${Math.ceil(probability * 100)}%`;
}

function extractTopMoves(policy: Record<string, number>, limit = 5): MoveProbability[] {
  return Object.entries(policy)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([move, probability]) => ({ move, probability, percentage: toPercentageString(probability) }));
}

function attachMoveWdl(topMoves: MoveProbability[], maps: WdlMaps): MoveProbability[] {
  return topMoves.map((m) => ({
    ...m,
    ...(maps.wdlMap.get(m.move)      ? { wdl:      maps.wdlMap.get(m.move)      } : {}),
    ...(maps.whiteWdlMap.get(m.move) ? { whiteWdl: maps.whiteWdlMap.get(m.move) } : {}),
    ...(maps.blackWdlMap.get(m.move) ? { blackWdl: maps.blackWdlMap.get(m.move) } : {}),
  }));
}

function buildSanToUci(uciPolicy: Record<string, number>, fen: string): Map<string, string> {
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

function fillWdlMaps(
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

async function computePerMoveWdlMaia3(
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

async function computePerMoveWdlLeela(
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

function hasPerMoveWdl(entry: EngineAnalysis): boolean {
  return (
    entry.topMoves.length > 0 &&
    entry.topMoves.every((m) => m.wdl !== undefined && m.whiteWdl !== undefined && m.blackWdl !== undefined)
  );
}

function isCacheValid(entry: EngineAnalysis, requireWdl: boolean): boolean {
  if (entry._schemaVersion !== CACHE_SCHEMA_VERSION) return false;
  if (!entry.topMoves || entry.topMoves.length === 0) return false;
  if (requireWdl && !hasPerMoveWdl(entry)) return false;
  return true;
}

function isBatchCacheValid(batch: { rating: number; analysis: EngineAnalysis }[]): boolean {
  return batch.length > 0 && batch.every(({ analysis }) => isCacheValid(analysis, false));
}

export class ModelLoader {
  private leelaModel!: LeelaModel;
  private eliteLeelaModel!: LeelaModel;
  private maia3Model!: Maia3Model;

  private constructor() {}

  static async create() {
    const loader = new ModelLoader();
    loader.maia3Model = await Maia3Model.create(MAIA_THREE_PATH!!);
    loader.leelaModel = await LeelaModel.create(LEELA_PATH!!);
    loader.eliteLeelaModel = await LeelaModel.create(ELITE_LEELA_PATH!!);
    return loader;
  }

  async analyzeMaia3(fen: string, rating: number, rawWDL = false): Promise<EngineAnalysis> {
    const validRating = rating < 600 || rating > 2600 ? 2600 : rating;
    const cacheNet = `maia3_${validRating}` as NetName;
    const hit = !DISABLE_CACHE ? await getCached(cacheNet, fen) : null;
    if (hit && isCacheValid(hit, rawWDL)) return hit as EngineAnalysis;

    const uciEval = await this.maia3Model.evaluate(fen, validRating, validRating);
    const sanEval = uciEvalToSan(uciEval, fen);
    const rawTopMoves = extractTopMoves(sanEval.policy, 5);

    let topMoves = rawTopMoves;
    if (rawWDL) {
      const wdlMaps = await computePerMoveWdlMaia3(
        rawTopMoves.map((m) => m.move),
        uciEval.policy,
        fen,
        validRating,
        this.maia3Model,
      );
      topMoves = attachMoveWdl(rawTopMoves, wdlMaps);
    }

    const result: EngineAnalysis = {
      topMoves,
      uciEval,
      maiaRating: validRating,
      HumanEstimateEval: evalText(uciEval.value),
      LeelaZeroEstimateEval: uciEval.rawWdl ? lc0EvalText(uciEval.rawWdl) : "not_found",
      cacheHit: false,
      _net: cacheNet,
      _schemaVersion: CACHE_SCHEMA_VERSION,
    };

    if (!DISABLE_CACHE) putCached(cacheNet, fen, result);
    return result;
  }

  async analyzeLeela(fen: string, elite = false, rawWDL = false): Promise<EngineAnalysis> {
    const cacheNet = elite ? "elite_leela" : "leela";
    const hit = !DISABLE_CACHE ? await getCached(cacheNet, fen) : null;
    if (hit && isCacheValid(hit, rawWDL)) return hit as EngineAnalysis;

    const model = elite ? this.eliteLeelaModel : this.leelaModel;
    const uciEval = await model.evaluate(fen);
    const sanEval = uciEvalToSan(uciEval, fen);
    const rawTopMoves = extractTopMoves(sanEval.policy, 5);

    let topMoves = rawTopMoves;
    if (rawWDL) {
      const wdlMaps = await computePerMoveWdlLeela(
        rawTopMoves.map((m) => m.move),
        uciEval.policy,
        fen,
        model,
      );
      topMoves = attachMoveWdl(rawTopMoves, wdlMaps);
    }

    const result: EngineAnalysis = {
      topMoves,
      uciEval,
      HumanEstimateEval: evalText(uciEval.value),
      LeelaZeroEstimateEval: uciEval.rawWdl ? lc0EvalText(uciEval.rawWdl) : "not_found",
      cacheHit: false,
      _net: cacheNet,
      _schemaVersion: CACHE_SCHEMA_VERSION,
    };

    if (!DISABLE_CACHE) putCached(cacheNet, fen, result);
    return result;
  }

  async batchAnalyzeMaia3AllLevels(fen: string): Promise<{ rating: number; analysis: EngineAnalysis }[]> {
    const cached = !DISABLE_CACHE ? await getBatchCached(fen) : null;
    if (cached) return cached;

    const positions = MAIA3_ALL_LEVELS.map((rating) => ({ fen, eloSelf: rating, eloOppo: rating }));
    const rawResults = await this.maia3Model.batchEvaluate(positions);

    const output: { rating: number; analysis: EngineAnalysis }[] = [];

    for (let i = 0; i < MAIA3_ALL_LEVELS.length; i++) {
      const rating = MAIA3_ALL_LEVELS[i];
      const uciEval = rawResults[i];
      const sanEval = uciEvalToSan(uciEval, fen);
      const cacheNet = `maia3_${rating}` as NetName;

      const analysis: EngineAnalysis = {
        topMoves: extractTopMoves(sanEval.policy, 5),
        uciEval,
        maiaRating: rating,
        HumanEstimateEval: evalText(uciEval.value),
        LeelaZeroEstimateEval: uciEval.rawWdl ? lc0EvalText(uciEval.rawWdl) : "not_found",
        _fen: fen,
        _net: cacheNet,
        _schemaVersion: CACHE_SCHEMA_VERSION,
      };

      output.push({ rating, analysis });
    }

    if (!DISABLE_CACHE) await putBatchCached(fen, output);
    return output;
  }

  getLeelaModel() { return this.leelaModel; }
  getEliteLeelaModel() { return this.eliteLeelaModel; }
  getMaiaThreeModel() { return this.maia3Model; }
}
