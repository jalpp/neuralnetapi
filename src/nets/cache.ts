import { Firestore, Timestamp } from "@google-cloud/firestore";
import { EngineAnalysis, NetName } from "./ModelLoader.js";

const db = new Firestore({
  projectId: process.env.FIRESTORE_PROJECT_ID,
});

const COLLECTION = "nn_cache";

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