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

export async function getCached(
  net: NetName,
  fen: string,
): Promise<EngineAnalysis | null> {
  try {
    const snap = await db.collection(COLLECTION).doc(docId(net, fen)).get();
    return snap.exists ? (snap.data() as EngineAnalysis) : null;
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

/**
 * Persists a full batch (all 21 Maia3 rating levels) for a single FEN.
 *
 * Layout in Firestore:
 *   nn_batch_results/{safeFen}        — top-level summary doc
 *     ratings/{rating}               — sub-collection, one doc per level
 *
 * Firestore batched writes are limited to 500 ops; 21 ratings + 1 summary = 22, well within limit.
 */
export async function putCachedBatch(
  fen: string,
  levels: { rating: number; analysis: EngineAnalysis }[],
): Promise<void> {
  try {
    const safeFen = normaliseFen(fen).replace(/\//g, "|");
    const batch = db.batch();
    const now = Timestamp.now();

    // Summary document
    const summaryRef = db.collection(BATCH_COLLECTION).doc(safeFen);
    batch.set(summaryRef, {
      _fen: normaliseFen(fen),
      _createdAt: now,
      ratingsCovered: levels.map((l) => l.rating),
    });

    // One sub-document per rating level
    for (const { rating, analysis } of levels) {
      const ratingRef = summaryRef.collection("ratings").doc(String(rating));
      batch.set(ratingRef, {
        ...analysis,
        _fen: normaliseFen(fen),
        _createdAt: now,
      });

      // Also mirror into the regular cache so single-FEN lookups are warm
      const cacheRef = db
        .collection(COLLECTION)
        .doc(docId(`maia3_${rating}` as NetName, fen));
      batch.set(cacheRef, {
        ...analysis,
        _fen: normaliseFen(fen),
        _net: `maia3_${rating}`,
        _createdAt: now,
      });
    }

    await batch.commit();
  } catch (err) {
    console.error("[cache] batch write error:", err);
  }
}