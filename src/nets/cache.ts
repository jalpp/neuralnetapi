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


export async function putCachedBatch(
  fen: string,
  levels: { rating: number; analysis: EngineAnalysis }[],
): Promise<void> {
  try {
    const safeFen = normaliseFen(fen).replace(/\//g, "|");
    const batch = db.batch();
    const now = Timestamp.now();

    const summaryRef = db.collection(BATCH_COLLECTION).doc(safeFen);
    batch.set(summaryRef, {
      _fen: normaliseFen(fen),
      _createdAt: now,
      ratingsCovered: levels.map((l) => l.rating),
    });

    for (const { rating, analysis } of levels) {
   
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