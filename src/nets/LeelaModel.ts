import { Tensor } from "onnxruntime-node";
import NetModel from "./NetModel.js";
import { preprocessLeela } from "./tensor.js";
import { pickOutput, processLeelaPolicy, wdlToWinProb } from "./helper.js";

export class LeelaModel {
  private net!: NetModel;

  private constructor() {}

  static async create(path: string) {
    const instance = new LeelaModel();
    instance.net = await NetModel.create(path);
    return instance;
  }

  static createFromNet(net: NetModel): LeelaModel {
    const instance = new LeelaModel();
    instance.net = net;
    return instance;
  }

  async evaluate(fen: string) {
    const { boardInput, legalMoves } = preprocessLeela(fen);
    const inputTensor = new Tensor("float32", boardInput, [1, 112, 8, 8]);

    const outputs = await this.net.run({ "/input/planes": inputTensor });

    const policyTensor = pickOutput(outputs, ["policy", "/output/policy"]);
    const wdlTensor = pickOutput(outputs, ["wdl", "/output/wdl"]);

    const value = wdlToWinProb(wdlTensor, fen);
    const policy = processLeelaPolicy(fen, policyTensor, legalMoves);

    inputTensor.dispose();
    policyTensor.dispose();
    wdlTensor.dispose();

    return { policy, value: value.winProb, rawWdl: value.rawWdl };
  }

  async batchEval(positions: { fen: string }[]) {
    const boards: Float32Array[] = [];
    const legalMovesList: Float32Array[] = [];
    const fens: string[] = [];

    for (const p of positions) {
      const { boardInput, legalMoves } = preprocessLeela(p.fen);
      boards.push(boardInput);
      legalMovesList.push(legalMoves);
      fens.push(p.fen);
    }

    const batch = boards.length;
    const input = new Float32Array(batch * 112 * 8 * 8);
    boards.forEach((b, i) => input.set(b, i * b.length));

    const inputTensor = new Tensor("float32", input, [batch, 112, 8, 8]);
    const outputs = await this.net.run({ "/input/planes": inputTensor });

    const policyTensor = pickOutput(outputs, ["policy", "/output/policy"]);
    const wdlTensor = pickOutput(outputs, ["wdl", "/output/wdl"]);

    const policyData = policyTensor.data as Float32Array;
    const wdlData = wdlTensor.data as Float32Array;

    const results = [];
    for (let i = 0; i < batch; i++) {
      const policySlice = policyData.subarray(i * 1858, (i + 1) * 1858);
      const wdlSlice = wdlData.subarray(i * 3, (i + 1) * 3);
      const value = wdlToWinProb({ data: wdlSlice } as Tensor, fens[i]);
      const policy = processLeelaPolicy(fens[i], { data: policySlice } as Tensor, legalMovesList[i]);
      results.push({ policy, value: value.winProb, rawWdl: value.rawWdl });
    }

    inputTensor.dispose();
    policyTensor.dispose();
    wdlTensor.dispose();

    return results;
  }
}
