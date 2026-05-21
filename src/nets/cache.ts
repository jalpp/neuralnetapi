import { Firestore, Timestamp } from "@google-cloud/firestore";
import { EngineAnalysis, NetName } from "./ModelLoader.js";

const db = new Firestore({
  projectId: process.env.FIRESTORE_PROJECT_ID,
});

const COLLECTION = "nn_cache";
const BATCH_COLLECTION = "nn_batch_results";

function normaliseFen(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(" ");
}

function docId(net: NetName, fen: string): string {
  const safeFen = normaliseFen(fen).replace(/\//g, "|");
  return `${net}__${safeFen}`;
}

function batchDocId(fen: string): string {
  return normaliseFen(fen).replace(/\//g, "|");
}

export async function getCached(
  net: NetName,
  fen: string,
): Promise<EngineAnalysis | null> {
  try {
    const snap = await db.collection(COLLECTION).doc(docId(net, fen)).get();
    if (!snap.exists) return null;
    return { ...(snap.data() as EngineAnalysis), cacheHit: true };
  } catch (err) {
    console.error("[cache] read error:", err);
    return null;
  }
}

export async function putCached(
  net: NetName,
  fen: string,
  result: EngineAnalysis,
): Promise<void> {
  try {
    const entry: EngineAnalysis = {
      ...result,
      _fen: normaliseFen(fen),
      _net: net,
      _createdAt: Timestamp.now(),
    };
    await db.collection(COLLECTION).doc(docId(net, fen)).set(entry);
  } catch (err) {
    console.error("[cache] write error:", err);
  }
}

// ── Batch (all-21-levels) cache — 1 document, 1 read, 1 write ──────────────
//
// Document shape in nn_batch_results/<fenId>:
// {
//   _fen: string,
//   _createdAt: Timestamp,
//   levels: {
//     "600":  EngineAnalysis,
//     "700":  EngineAnalysis,
//     ...
//     "2600": EngineAnalysis,
//   }
// }

export interface BatchCacheDoc {
  _fen: string;
  _createdAt: Timestamp;
  levels: Record<string, EngineAnalysis>;
}

/**
 * Returns all 21 levels from a single Firestore read, or null on miss.
 */
export async function getBatchCached(
  fen: string,
): Promise<{ rating: number; analysis: EngineAnalysis }[] | null> {
  try {
    const snap = await db
      .collection(BATCH_COLLECTION)
      .doc(batchDocId(fen))
      .get();
    if (!snap.exists) return null;

    const doc = snap.data() as BatchCacheDoc;
    if (!doc.levels) return null;

    return Object.entries(doc.levels).map(([ratingStr, analysis]) => ({
      rating: Number(ratingStr),
      analysis: { ...analysis, cacheHit: true },
    }));
  } catch (err) {
    console.error("[cache] batch read error:", err);
    return null;
  }
}

/**
 * Persists all 21 levels as one Firestore document — 1 write total.
 */
export async function putBatchCached(
  fen: string,
  levels: { rating: number; analysis: EngineAnalysis }[],
): Promise<void> {
  try {
    const levelsMap: Record<string, EngineAnalysis> = {};
    for (const { rating, analysis } of levels) {
      levelsMap[String(rating)] = analysis;
    }

    const doc: BatchCacheDoc = {
      _fen: normaliseFen(fen),
      _createdAt: Timestamp.now(),
      levels: levelsMap,
    };

    await db.collection(BATCH_COLLECTION).doc(batchDocId(fen)).set(doc);
  } catch (err) {
    console.error("[cache] batch write error:", err);
  }
}