import ort from 'onnxruntime-node'

class NetModel {
  private model!: ort.InferenceSession

  private constructor() {}

  static async create(path: string): Promise<NetModel> {
    const instance = new NetModel()
    instance.model = await ort.InferenceSession.create(path)

    console.log('ONNX inputs:', instance.model.inputNames)
    console.log('ONNX outputs:', instance.model.outputNames)

    return instance
  }

  public run(inputs: Record<string, ort.Tensor>) {
    return this.model.run(inputs)
  }
}

export default NetModel
