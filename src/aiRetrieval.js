const { log } = require("./logger");
const { getAllEmbeddings } = require("./aiDatabase");
const { embedText, cosineSimilarity, isEnabled } = require("./aiEmbeddings");

const DEFAULT_K = 6;
const PRODUCT_BOOST = 0.1;
const POLICY_BOOST = 0.15;

const PRODUCT_KEYWORDS = [
  "buy", "price", "cost", "under", "over", "cheap", "expensive",
  "order", "cart", "stock", "available", "variant", "size", "color",
  "$", "dollars", "discount", "sale", "deal"
];

const SHIPPING_KEYWORDS = [
  "ship", "shipping", "deliver", "delivery", "arrive", "track",
  "carrier", "express", "free shipping", "days", "how long"
];

const RETURNS_KEYWORDS = [
  "return", "refund", "exchange", "money back", "policy",
  "damaged", "wrong item", "cancel"
];

function detectQueryType(query) {
  const lower = query.toLowerCase();
  
  const isProductQuery = PRODUCT_KEYWORDS.some(k => lower.includes(k));
  const isShippingQuery = SHIPPING_KEYWORDS.some(k => lower.includes(k));
  const isReturnsQuery = RETURNS_KEYWORDS.some(k => lower.includes(k));
  
  return {
    isProductQuery,
    isShippingQuery,
    isReturnsQuery
  };
}

async function retrieveContext(query, k = DEFAULT_K) {
  if (!isEnabled()) {
    log("[AI Retrieval] Embeddings not enabled, returning empty context");
    return { docs: [], scores: [] };
  }
  
  try {
    const queryEmbedding = await embedText(query);
    if (!queryEmbedding) {
      log("[AI Retrieval] Failed to embed query");
      return { docs: [], scores: [] };
    }
    
    const allEmbeddings = await getAllEmbeddings();
    if (!allEmbeddings || allEmbeddings.length === 0) {
      log("[AI Retrieval] No embeddings in database");
      return { docs: [], scores: [] };
    }
    
    const { isProductQuery, isShippingQuery, isReturnsQuery } = detectQueryType(query);
    
    const scored = allEmbeddings.map(doc => {
      let embedding;
      try {
        embedding = JSON.parse(doc.embedding_json);
      } catch {
        return { doc, score: 0 };
      }
      
      let score = cosineSimilarity(queryEmbedding, embedding);
      
      if (isProductQuery && doc.doc_id.startsWith("product:")) {
        score += PRODUCT_BOOST;
      }
      
      if (isShippingQuery && doc.doc_id === "policy:shipping") {
        score += POLICY_BOOST;
      }
      
      if (isReturnsQuery && doc.doc_id === "policy:returns") {
        score += POLICY_BOOST;
      }
      
      return { doc, score };
    });
    
    scored.sort((a, b) => b.score - a.score);
    
    let results = scored.slice(0, k);
    
    if (isShippingQuery) {
      const shippingDoc = scored.find(s => s.doc.doc_id === "policy:shipping");
      if (shippingDoc && !results.find(r => r.doc.doc_id === "policy:shipping")) {
        results = [shippingDoc, ...results.slice(0, k - 1)];
      }
    }
    
    if (isReturnsQuery) {
      const returnsDoc = scored.find(s => s.doc.doc_id === "policy:returns");
      if (returnsDoc && !results.find(r => r.doc.doc_id === "policy:returns")) {
        results = [returnsDoc, ...results.slice(0, k - 1)];
      }
    }
    
    log(`[AI Retrieval] Retrieved ${results.length} docs for query: "${query.substring(0, 50)}..."`);
    
    return {
      docs: results.map(r => ({
        doc_id: r.doc.doc_id,
        content: r.doc.content_text,
        score: r.score
      })),
      scores: results.map(r => r.score),
      queryType: { isProductQuery, isShippingQuery, isReturnsQuery }
    };
    
  } catch (err) {
    log(`[AI Retrieval] Error: ${err.message}`);
    return { docs: [], scores: [], error: err.message };
  }
}

function formatContextForLLM(retrievalResult) {
  if (!retrievalResult.docs || retrievalResult.docs.length === 0) {
    return "No relevant context found in the knowledge base.";
  }
  
  const contextParts = retrievalResult.docs.map((doc, i) => {
    return `[Source ${i + 1}: ${doc.doc_id}]\n${doc.content}`;
  });
  
  return `KNOWLEDGE BASE CONTEXT:\n\n${contextParts.join("\n\n---\n\n")}`;
}

function extractProductIdsFromContext(retrievalResult) {
  if (!retrievalResult.docs) return [];
  
  return retrievalResult.docs
    .filter(d => d.doc_id.startsWith("product:"))
    .map(d => d.doc_id.replace("product:", ""));
}

module.exports = {
  retrieveContext,
  formatContextForLLM,
  extractProductIdsFromContext,
  detectQueryType,
  DEFAULT_K
};
