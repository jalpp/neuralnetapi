import { ModelLoader } from "./ModelLoader.js"

/**
 * ModelLoaderPool
 * - Loads ONNX models once
 * - Shares across concurrent requests
 * - Prevents duplicate initialization
 */
export class ModelLoaderPool {
  private static instance: ModelLoader | null = null
  private static loadingPromise: Promise<ModelLoader> | null = null

  static async get(): Promise<ModelLoader> {
    // Already initialized
    if (this.instance) {
      return this.instance
    }

    // Initialization in progress
    if (this.loadingPromise) {
      return this.loadingPromise
    }

    // First initializer
    this.loadingPromise = (async () => {
      const loader = await ModelLoader.create()
      this.instance = loader
      return loader
    })()

    return this.loadingPromise
  }
}
