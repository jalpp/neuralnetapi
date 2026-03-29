import { LeelaModel } from "./LeelaModel.js";
import { uciEvalToSan } from "./sanhelper.js";
import { MaiaEvaluation } from "./types.js";
import { Maia3Model } from "./Maia3Model.js";

export interface MoveProbability {
  move: string;
  probability: number;
  percentage: string;
}

export interface EngineAnalysis {
  topMoves: MoveProbability[];
  inBook?: boolean;
  uciEval?: MaiaEvaluation;
  maiaRating?: number;
  source: "lichess-book" | "maia2" | "leela" | "elite-leela" | "maia3";
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


const MAIA_THREE_PATH = process.env.MAIA_THREE_PATH;

const LEELA_PATH = process.env.LEELA_MODEL_PATH;

const ELITE_LEELA_PATH = process.env.ELITE_LEELA_MODEL_PATH;

export class ModelLoader {
  private leelaModel!: LeelaModel;
  private eliteLeelaModel!: LeelaModel;
  private maia3Model!: Maia3Model;

  private constructor() {}

  static async create() {
    const loader = new ModelLoader();

    loader.leelaModel = await LeelaModel.create(LEELA_PATH);
    loader.eliteLeelaModel = await LeelaModel.create(ELITE_LEELA_PATH);
    loader.maia3Model = await Maia3Model.create(MAIA_THREE_PATH);
    return loader;
  }

  async analyzeMaia3(fen: string, rating: number): Promise<EngineAnalysis> {
    let validRating = 0;

    if (rating < 600 || rating > 2600) {
      validRating = 2600;
    }

    const uciEval = await this.maia3Model.evaluate(
      fen,
      validRating,
      validRating,
    );

    const sanEval = uciEvalToSan(uciEval, fen);

    return {
      topMoves: extractTopMoves(sanEval.policy),
      maiaRating: validRating,
      source: "maia3",
    };
  }

  async analyzeLeela(fen: string, elite = false): Promise<EngineAnalysis> {
    const model = elite ? this.eliteLeelaModel : this.leelaModel;
    const uciEval = await model.evaluate(fen);
    const sanEval = uciEvalToSan(uciEval, fen);

    return {
      topMoves: extractTopMoves(sanEval.policy),
      uciEval: uciEval,
      source: elite ? "elite-leela" : "leela",
    };
  }


  getLeelaModel() {
    return this.leelaModel;
  }

  getEliteLeelaModel() {
    return this.eliteLeelaModel;
  }

  getMaiaThreeModel() {
    return this.maia3Model;
  }
}
