const { log } = require("./logger");
const { buildKnowledgeDocs } = require("./knowledgeDocs");
const { embedTexts, isEnabled: embeddingsEnabled } = require("./aiEmbeddings");
const {
  getEmbeddingHashes,
  upsertEmbedding,
  deleteEmbeddingsNotIn,
  getEmbeddingsCount
} = require("./aiDatabase");

async function reindexDelta() {
  const startTime = Date.now();
  
  if (!embeddingsEnabled()) {
    throw new Error("OpenAI API key not configured");
  }
  
  log("[AI Reindex] Starting delta reindex...");
  
  const docs = await buildKnowledgeDocs();
  const existingHashes = await getEmbeddingHashes();
  
  const changedDocs = docs.filter(doc => {
    const existing = existingHashes[doc.doc_id];
    return !existing || existing !== doc.content_hash;
  });
  
  log(`[AI Reindex] Found ${changedDocs.length} changed/new docs out of ${docs.length} total`);
  
  let embedded = 0;
  let failed = 0;
  if (changedDocs.length > 0) {
    const texts = changedDocs.map(d => d.content_text);
    const embeddings = await embedTexts(texts);
    
    for (let i = 0; i < changedDocs.length; i++) {
      const doc = changedDocs[i];
      const embedding = embeddings[i];
      
      if (embedding) {
        await upsertEmbedding(
          doc.doc_id,
          doc.content_hash,
          doc.content_text,
          JSON.stringify(embedding)
        );
        embedded++;
      } else {
        failed++;
        log(`[AI Reindex] Failed to embed doc: ${doc.doc_id} (will retry next run)`);
      }
    }
    
    if (failed > 0) {
      log(`[AI Reindex] Warning: ${failed} docs failed embedding, will retry on next delta run`);
    }
  }
  
  const currentDocIds = docs.map(d => d.doc_id);
  const deleted = await deleteEmbeddingsNotIn(currentDocIds);
  
  const duration = Date.now() - startTime;
  const stats = {
    totalDocs: docs.length,
    changedDocs: changedDocs.length,
    embedded,
    failed,
    deleted: deleted || 0,
    durationMs: duration
  };
  
  log(`[AI Reindex] Delta complete: ${JSON.stringify(stats)}`);
  
  return stats;
}

async function reindexFull() {
  const startTime = Date.now();
  
  if (!embeddingsEnabled()) {
    throw new Error("OpenAI API key not configured");
  }
  
  log("[AI Reindex] Starting full reindex...");
  
  const docs = await buildKnowledgeDocs();
  
  log(`[AI Reindex] Embedding ${docs.length} documents...`);
  
  const texts = docs.map(d => d.content_text);
  const embeddings = await embedTexts(texts);
  
  let embedded = 0;
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const embedding = embeddings[i];
    
    if (embedding) {
      await upsertEmbedding(
        doc.doc_id,
        doc.content_hash,
        doc.content_text,
        JSON.stringify(embedding)
      );
      embedded++;
    }
  }
  
  const currentDocIds = docs.map(d => d.doc_id);
  const deleted = await deleteEmbeddingsNotIn(currentDocIds);
  
  const duration = Date.now() - startTime;
  const stats = {
    totalDocs: docs.length,
    changedDocs: docs.length,
    embedded,
    deleted: deleted || 0,
    durationMs: duration
  };
  
  log(`[AI Reindex] Full reindex complete: ${JSON.stringify(stats)}`);
  
  return stats;
}

async function getReindexStatus() {
  const count = await getEmbeddingsCount();
  return {
    embeddingsCount: count,
    embeddingsEnabled: embeddingsEnabled()
  };
}

module.exports = {
  reindexDelta,
  reindexFull,
  getReindexStatus
};
