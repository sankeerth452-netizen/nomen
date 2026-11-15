import { db } from "../db";
import type { ProductFacts } from "../providers/types";
import { attributeTerms, retrieveCandidates, type RawCandidate } from "./retrieve";
import { rankCandidates, type BrandRules, type ScoredKeyword, type Weights } from "./score";
import { activeDatasetId } from "./versions";
import { getOrderModel } from "./orderStore";
import { categoryForType } from "../vocab/fashion";

export type KeywordEvidence = { datasetId: string | null; rawCount: number; liveCount: number; top: ScoredKeyword[]; limited: boolean; orderModel: import("./orderModel").OrderModel | null };

/**
 * Stage 3: retrieve from the brand's ACTIVE dataset and keep the best 20-40 for the model. `live` adds Google's own
 * figures for phrases the list doesn't have (it sees what the list found); both are scored by the same rules.
 */
export async function keywordEvidenceFor(brandId: string, facts: ProductFacts, opts: { keep?: number; weights?: Weights; live?: (found: RawCandidate[]) => Promise<RawCandidate[]> } = {}): Promise<KeywordEvidence> {
  const datasetId = await activeDatasetId(brandId);
  if (!datasetId && !opts.live) return { datasetId: null, rawCount: 0, liveCount: 0, top: [], limited: true, orderModel: null };
  const brand = await db.brand.findUniqueOrThrow({ where: { id: brandId }, select: { settings: true } });
  const s = (brand.settings ?? {}) as BrandRules;
  const [fromList, orderModel] = datasetId ? await Promise.all([retrieveCandidates(datasetId, facts), getOrderModel(datasetId)]) : [[], null];
  const live = opts.live ? await opts.live(fromList) : [];
  const raw = [...fromList, ...live];
  const top = rankCandidates(raw, facts, { prohibitedTerms: s.prohibitedTerms, avoidWords: s.avoidWords, attributeOrder: s.attributeOrder, orderModel, category: categoryForType(facts.product_type) }, opts.weights, opts.keep ?? 30);
  // "Limited keyword evidence": nothing found, or (when the buyer gave attributes) nothing reflects any of them.
  const hasAttrs = attributeTerms(facts).length > 0;
  const limited = top.length === 0 || (hasAttrs && top.every((k) => k.coverage === 0));
  return { datasetId, rawCount: raw.length, liveCount: live.length, top, limited, orderModel };
}
