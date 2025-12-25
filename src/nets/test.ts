import { ModelLoader } from "./ModelLoader.js";


const loader = await ModelLoader.create();

console.log("Maia \n", await loader.analyzeMaia2WithBook("rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", 1900, 1900))
console.log("Elite Leela \n",await loader.analyzeLeela("rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", true))
console.log("Leela Model",await loader.analyzeLeela("rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", false))