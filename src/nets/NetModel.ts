import ort from 'onnxruntime-node'

const SESSION_OPTIONS: ort.InferenceSession.SessionOptions = {
  interOpNumThreads: 1,
  intraOpNumThreads: 1,
  executionMode: 'sequential',
  graphOptimizationLevel: 'basic',
}

class NetModel {
  private model!: ort.InferenceSession

  private constructor() {}

  static async create(path: string): Promise<NetModel> {
    const instance = new NetModel()
    instance.model = await ort.InferenceSession.create(path, SESSION_OPTIONS)

    console.log('ONNX inputs:', instance.model.inputNames)
    console.log('ONNX outputs:', instance.model.outputNames)

    return instance
  }

  static fromSession(session: ort.InferenceSession): NetModel {
    const instance = new NetModel()
    instance.model = session
    return instance
  }

  public run(inputs: Record<string, ort.Tensor>) {
    return this.model.run(inputs)
  }
}

export default NetModel