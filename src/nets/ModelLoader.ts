import { LeelaModel } from "./LeelaModel.js"
import { MaiaModel } from "./MaiaModel.js"
import {
  lichessToSanEval,
  uciEvalToSan,
} from "./sanhelper.js"
import { fetchLichessBook } from "./lichessopeningbook.js"
import fs from "fs"
import path from "path"
import fetch from "node-fetch"

/* -------------------- SHARED TYPES -------------------- */

export interface MoveProbability {
  move: string              // SAN
  probability: number       // 0–1
  percentage: string        // e.g. "34%"
}

export interface EngineAnalysis {
  topMoves: MoveProbability[]
  inBook?: boolean
  source: "lichess-book" | "maia2" | "leela" | "elite-leela"
}

/* -------------------- HELPERS -------------------- */

function toPercentageString(probability: number): string {
  return `${Math.ceil(probability * 100)}%`
}

function extractTopMoves(
  policy: Record<string, number>,
  limit = 5
): MoveProbability[] {
  return Object.entries(policy)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([move, probability]) => ({
      move,
      probability,
      percentage: toPercentageString(probability),
    }))
}

  const maiaUrl = process.env.MAIA_MODEL_URL
  const leelaUrl = process.env.LEELA_MODEL_URL
  const eliteleelaurl = process.env.ELITE_LEELA_MODEL_URL;
/* -------------------- MODEL LOADER -------------------- */

export class ModelLoader {
  private maiaModel!: MaiaModel
  private leelaModel!: LeelaModel
  private eliteLeelaModel!: LeelaModel

  private constructor() {}

  
   async downloadToTmp(url: string, filename: string): Promise<string> {
    const tmpPath = path.join("/tmp", filename)
    if (fs.existsSync(tmpPath)) return tmpPath

    const res = await fetch(url)
    const arrayBuffer = await res.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)
    fs.writeFileSync(tmpPath, buffer)
    return tmpPath
  }

  static async create() {
    const loader = new ModelLoader()

    const maiaPath = await loader.downloadToTmp(maiaUrl, "maia_rapid.onnx")
    const leelaPath = await loader.downloadToTmp(leelaUrl, "t1-256x10.onnx")
    const eliteLeelaPath = await loader.downloadToTmp(eliteleelaurl, "eliteleelav2.onnx")

    loader.maiaModel = await MaiaModel.create(maiaPath)
    loader.leelaModel = await LeelaModel.create(leelaPath)
    loader.eliteLeelaModel = await LeelaModel.create(eliteLeelaPath)
    return loader
  }

  /* ------------------ MAIA 2 + LICHESS BOOK ------------------ */

  async analyzeMaia2WithBook(
    fen: string,
    rating: number,
    bookThreshold = 21
  ): Promise<EngineAnalysis> {
    const book = await fetchLichessBook(fen, rating)
    const games = book.white + book.draws + book.black

    if (games >= bookThreshold) {
      const sanEval = lichessToSanEval(book)

      return {
        topMoves: extractTopMoves(sanEval.policy),
        inBook: true,
        source: "lichess-book",
      }
    }

    const uciEval = await this.maiaModel.evaluate(
      fen,
      rating,
      rating
    )

    const sanEval = uciEvalToSan(uciEval, fen)

    return {
      topMoves: extractTopMoves(sanEval.policy),
      inBook: false,
      source: "maia2",
    }
  }

  /* ------------------ LEELA / ELITE LEELA ------------------ */

  async analyzeLeela(
    fen: string,
    elite = false
  ): Promise<EngineAnalysis> {
    const model = elite ? this.eliteLeelaModel : this.leelaModel
    const uciEval = await model.evaluate(fen)
    const sanEval = uciEvalToSan(uciEval, fen)

    return {
      topMoves: extractTopMoves(sanEval.policy),
      source: elite ? "elite-leela" : "leela",
    }
  }

  /* ------------------ GETTERS ------------------ */

  getMaiaModel() {
    return this.maiaModel
  }

  getLeelaModel() {
    return this.leelaModel
  }

  getEliteLeelaModel() {
    return this.eliteLeelaModel
  }
}
