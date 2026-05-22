import { LeelaModel } from "./LeelaModel.js";
import { uciEvalToSan } from "./sanhelper.js";
import { MaiaEvaluation } from "./types.js";
import { Maia3Model } from "./Maia3Model.js";
import { evalText, lc0EvalText } from "./humaneval.js";
import { getCached, putCached, getBatchCached, putBatchCached } from "./cache.js";
import { Timestamp } from "@google-cloud/firestore";
import { MAIA3_ALL_LEVELS } from "../validation.js";

export interface MoveProbability {
  move: string;
  probability: number;
  percentage: string;
}
export type NetName = "leela" | "elite_leela" | `maia3_${number}`;

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
  _createdAt?: Timestamp
}

function toPercentageString(probability: number): string {
  return `${Math.ceil(probability * 100)}%`;
}

function extractTopMoves(
  policy: Record<string, number>,
  limit = 5,
): MoveProbability[] {
  return Object.entries(policy)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([move, probability]) => ({
      move,
      probability,
      percentage: toPercentageString(probability),
    }));
}
const DISABLE_CACHE =
  process.env.DISABLE_CACHE?.toLowerCase() === "true" || process.argv.includes("dev");

const MAIA_THREE_PATH = DISABLE_CACHE
  ? "./models/maia3_simplified.onnx"
  : process.env.MAIA_THREE_PATH;
const LEELA_PATH = DISABLE_CACHE
  ? "./models/t1-256x10.onnx"
  : process.env.LEELA_MODEL_PATH;
const ELITE_LEELA_PATH = DISABLE_CACHE
  ? "./models/eliteleelav2.onnx"
  : process.env.ELITE_LEELA_MODEL_PATH;


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

  async analyzeMaia3(fen: string, rating: number): Promise<EngineAnalysis> {
    const validRating = rating < 600 || rating > 2600 ? 2600 : rating;
    const cacheNet = `maia3_${validRating}` as NetName;
    const hit = !DISABLE_CACHE ? await getCached(cacheNet, fen) : null;
    if (hit) return hit as EngineAnalysis;

    const uciEval = await this.maia3Model.evaluate(fen, validRating, validRating);
    const sanEval = uciEvalToSan(uciEval, fen);

    const result: EngineAnalysis = {
      topMoves: extractTopMoves(sanEval.policy),
      maiaRating: validRating,
      HumanEstimateEval: evalText(uciEval.value),
      LeelaZeroEstimateEval: uciEval.rawWdl ? lc0EvalText(uciEval.rawWdl) : "not_found",
      cacheHit: false,
      _net: cacheNet,
    };

    if (!DISABLE_CACHE) putCached(cacheNet, fen, result);
    return result;
  }

  async analyzeLeela(fen: string, elite = false): Promise<EngineAnalysis> {
    const cacheNet = elite ? "elite_leela" : "leela";
    const hit = !DISABLE_CACHE ? await getCached(cacheNet, fen) : null;
    if (hit) return hit as EngineAnalysis;

    const model = elite ? this.eliteLeelaModel : this.leelaModel;
    const uciEval = await model.evaluate(fen);
    const sanEval = uciEvalToSan(uciEval, fen);

    const result: EngineAnalysis = {
      topMoves: extractTopMoves(sanEval.policy),
      uciEval,
      HumanEstimateEval: evalText(uciEval.value),
      LeelaZeroEstimateEval: uciEval.rawWdl ? lc0EvalText(uciEval.rawWdl) : "not_found",
      cacheHit: false,
      _net: cacheNet,
    };

    if (!DISABLE_CACHE) {
      putCached(cacheNet, fen, result);
    }
    return result;
  }

 
  async batchAnalyzeMaia3AllLevels(
    fen: string,
  ): Promise<{ rating: number; analysis: EngineAnalysis }[]> {
    const cached = !DISABLE_CACHE ? await getBatchCached(fen) : null;
    if (cached) return cached;

    // Build the 21 position descriptors for batchEvaluate
    const positions = MAIA3_ALL_LEVELS.map((rating) => ({
      fen,
      eloSelf: rating,
      eloOppo: rating,
    }));

    const rawResults = await this.maia3Model.batchEvaluate(positions);

    const output: { rating: number; analysis: EngineAnalysis }[] = [];

    for (let i = 0; i < MAIA3_ALL_LEVELS.length; i++) {
      const rating = MAIA3_ALL_LEVELS[i];
      const uciEval = rawResults[i];
      const sanEval = uciEvalToSan(uciEval, fen);
      const cacheNet = `maia3_${rating}` as NetName;

      const analysis: EngineAnalysis = {
        topMoves: extractTopMoves(sanEval.policy),
        maiaRating: rating,
        HumanEstimateEval: evalText(uciEval.value),
        LeelaZeroEstimateEval: uciEval.rawWdl
          ? lc0EvalText(uciEval.rawWdl)
          : "not_found",
        _fen: fen,
        _net: cacheNet,
      };

      output.push({ rating, analysis });
    }

    if (!DISABLE_CACHE) {
       await putBatchCached(fen, output);
    }

    return output;
  }

  getLeelaModel() { return this.leelaModel; }
  getEliteLeelaModel() { return this.eliteLeelaModel; }
  getMaiaThreeModel() { return this.maia3Model; }
}