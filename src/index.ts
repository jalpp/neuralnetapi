import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { ModelLoaderPool } from "./nets/ModelLoaderPool.js";
import {
  validateFen,
  validateEngine,
  validateMaiaRating,
  combineValidations,
} from "./validation.js";

const DISABLE_CACHE_MODE = process.env.DISABLE_CACHE?.toLowerCase() === "true" || process.argv.includes("dev");

const app = express();

app.set("trust proxy", true);
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again after a minute." },
  keyGenerator: (req: Request) => {
    return req.ip || req.socket.remoteAddress || "unknown";
  },
  skip: (req: Request) => {
    return false;
  },
});

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const configuredToken = process.env.CONFIGURED_AUTH_BEARER;

  if (!configuredToken || DISABLE_CACHE_MODE) {
    console.warn(
      "CONFIGURED_AUTH_BEARER not set. Running without authorization."
    );
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Missing authorization header" });
  }

  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    return res.status(401).json({
      error: "Invalid authorization header format. Use: Bearer <token>",
    });
  }

  const token = tokenMatch[1];
  if (token !== configuredToken) {
    return res.status(403).json({ error: "Invalid or unauthorized token" });
  }

  next();
};

app.post("/nn-analyze", authMiddleware, async (req: Request, res: Response) => {
  const { fen, engine, rating } = req.body;

  const fenResult = validateFen(fen);
  const engineResult = validateEngine(engine);

  const needsRating = engine === "maia3" || engine === "maia2";
  const ratingResult = needsRating
    ? validateMaiaRating(rating)
    : { valid: true, errors: [] };

  const combined = combineValidations(fenResult, engineResult, ratingResult);

  if (!combined.valid) {
    return res.status(400).json({
      error: "Validation failed",
      details: combined.errors,
    });
  }

  try {
    const modelLoader = await ModelLoaderPool.get();
    let analysis;

    switch (engine) {
      case "maia3":
        analysis = await modelLoader.analyzeMaia3(fen, Number(rating));
        break;
      case "leela":
        analysis = await modelLoader.analyzeLeela(fen);
        break;
      case "elite-leela":
        analysis = await modelLoader.analyzeLeela(fen, true);
        break;
      default:
        return res.status(400).json({ error: "Invalid engine" });
    }

    return res.json({ success: true, data: analysis });
  } catch (err) {
    console.error("[/nn-analyze] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/nn-batch-maia3", authMiddleware, async (req: Request, res: Response) => {
  const { fen } = req.body;

  const fenResult = validateFen(fen);
  if (!fenResult.valid) {
    return res.status(400).json({
      error: "Validation failed",
      details: fenResult.errors,
    });
  }

  try {
    const modelLoader = await ModelLoaderPool.get();
    const results = await modelLoader.batchAnalyzeMaia3AllLevels(fen);

    return res.json({
      success: true,
      fen,
      totalLevels: results.length,
      results,
    });
  } catch (err) {
    console.error("[/nn-batch-maia3] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[unhandled]", err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 8080;


app.listen(PORT, () => {
  console.log(`Chess Neural Net Database Server running on port ${PORT} DISABLE_CACHE_MODE: ${DISABLE_CACHE_MODE}`);
});