const OpenAI = require("openai");
const { log } = require("./logger");

const API_KEY = process.env.OPENAI_API_KEY || "";
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const BATCH_SIZE = 64;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

let client = null;

function getClient() {
  if (!client && API_KEY) {
    client = new OpenAI({ 
      apiKey: API_KEY,
      baseURL: "https://api.openai.com/v1"
    });
    log(`[AI Embeddings] Initialized with model: ${EMBEDDING_MODEL} (direct API)`);
  }
  return client;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function embedText(text) {
  const openai = getClient();
  if (!openai) {
    throw new Error("OpenAI client not initialized - check OPENAI_API_KEY");
  }
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000)
      });
      
      return response.data[0].embedding;
    } catch (err) {
      const isRateLimit = err.status === 429;
      const isServerError = err.status >= 500;
      
      if ((isRateLimit || isServerError) && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        log(`[AI Embeddings] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms: ${err.message}`);
        await sleep(delay);
        continue;
      }
      
      throw err;
    }
  }
}

async function embedTexts(texts) {
  const results = [];
  const batches = [];
  
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(texts.slice(i, i + BATCH_SIZE));
  }
  
  log(`[AI Embeddings] Processing ${texts.length} texts in ${batches.length} batches`);
  
  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const batchResults = [];
    
    for (const text of batch) {
      try {
        const embedding = await embedText(text);
        batchResults.push(embedding);
      } catch (err) {
        log(`[AI Embeddings] Failed to embed text: ${err.message}`);
        batchResults.push(null);
      }
      
      if (batch.length > 1) {
        await sleep(50);
      }
    }
    
    results.push(...batchResults);
    
    if (batchIdx < batches.length - 1) {
      log(`[AI Embeddings] Completed batch ${batchIdx + 1}/${batches.length}`);
      await sleep(200);
    }
  }
  
  return results;
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

function isEnabled() {
  return !!API_KEY;
}

module.exports = {
  embedText,
  embedTexts,
  cosineSimilarity,
  isEnabled,
  getClient,
  EMBEDDING_MODEL
};
