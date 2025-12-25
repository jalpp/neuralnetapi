import express from "express";
import cors from "cors";
import { ModelLoaderPool } from "./nets/ModelLoaderPool.js";

const app = express();

app.use(cors());
app.use(express.json());

app.post("/nn-analyze", async (req, res) => {
  const { fen, engine, rating } = req.body
  if (!fen) return res.status(400).json({ error: "FEN is required" })

  const modelLoader = await ModelLoaderPool.get()
  let analysis

  switch(engine) {
    case "maia2":
      analysis = await modelLoader.analyzeMaia2WithBook(fen, rating)
      break
    case "leela":
      analysis = await modelLoader.analyzeLeela(fen)
      break
    case "elite-leela":
      analysis = await modelLoader.analyzeLeela(fen, true)
      break
    default:
      return res.status(400).json({ error: "Invalid engine" })
  }

  res.json({ success: true, data: analysis })
})

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Neural Net Server running on port ${PORT}`);
});
