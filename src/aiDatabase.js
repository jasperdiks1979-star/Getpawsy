const { Pool } = require("pg");
const { log } = require("./logger");

// Smart SSL detection: Use SSL only for external hosts (production), not for local/dev
const useSSL = process.env.PGHOST && 
  !process.env.PGHOST.includes('localhost') && 
  !process.env.PGHOST.includes('127.0.0.1') &&
  !process.env.PGHOST.includes('.svc.cluster.local');

// PostgreSQL connection pool with conditional SSL and aggressive timeouts for deployment safety
const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: 5,  // Reduced from 10 for deployment safety
  idleTimeoutMillis: 10000,  // Reduced from 30000
  connectionTimeoutMillis: 1000,  // Reduced from 2000 - fail fast on deploy
});

// Handle connection errors
pool.on('error', (err) => {
  log(`[AI DB] Unexpected error on idle client: ${err.message}`);
});

async function initAITables() {
  // CRITICAL FIX: AI tables are DISABLED by default to prevent Replit schema conflicts
  // To enable PostgreSQL AI features, set ENABLE_AI_PG=1 in environment
  // Without this flag, the app uses JSON storage which works perfectly in production
  if (process.env.ENABLE_AI_PG !== '1' && process.env.ENABLE_AI_PG !== 'true') {
    return; // Skip - AI PostgreSQL disabled (default)
  }
  
  // Additional safety checks
  if (process.env.REPLIT_DEPLOYMENT || process.env.REPLIT_DEPLOYMENT_ID) {
    return; // Never during deployment
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Create ai_embeddings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_embeddings (
        doc_id TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL,
        content_text TEXT NOT NULL,
        embedding_json TEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create ai_jobs table with enhanced job locking columns
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_jobs (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'idle',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        finished_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        progress INTEGER DEFAULT 0,
        total INTEGER DEFAULT 0,
        last_heartbeat TIMESTAMP,
        cancel_requested BOOLEAN DEFAULT FALSE,
        error TEXT,
        stats_json TEXT
      )
    `);
    
    // Add new columns if they don't exist (for upgrades)
    await client.query(`ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    await client.query(`ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS total INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMP`);
    await client.query(`ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN DEFAULT FALSE`);

    // Create indexes for ai_jobs
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_jobs(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_jobs_type ON ai_jobs(type)`);

    // Create product_seo_localized table
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_seo_localized (
        id SERIAL PRIMARY KEY,
        product_id TEXT NOT NULL,
        locale TEXT NOT NULL DEFAULT 'en-US',
        seo_title TEXT,
        meta_description TEXT,
        h1 TEXT,
        bullets_json TEXT,
        faqs_json TEXT,
        alt_texts_json TEXT,
        og_title TEXT,
        og_description TEXT,
        jsonld TEXT,
        keywords_json TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        locked_fields_json TEXT,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(product_id, locale)
      )
    `);

    // Create indexes for product_seo_localized
    await client.query(`CREATE INDEX IF NOT EXISTS idx_seo_product_locale ON product_seo_localized(product_id, locale)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_seo_locale ON product_seo_localized(locale)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_seo_status ON product_seo_localized(status)`);

    // Create product_image_audit table
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_image_audit (
        id SERIAL PRIMARY KEY,
        product_id TEXT NOT NULL,
        image_url TEXT NOT NULL,
        has_text INTEGER DEFAULT 0,
        detected_lang TEXT,
        confidence REAL DEFAULT 0,
        is_infographic INTEGER DEFAULT 0,
        ocr_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(product_id, image_url)
      )
    `);

    // Create indexes for product_image_audit
    await client.query(`CREATE INDEX IF NOT EXISTS idx_image_audit_product ON product_image_audit(product_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_image_audit_lang ON product_image_audit(detected_lang)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_image_audit_infographic ON product_image_audit(is_infographic)`);

    // Create product_image_localized table
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_image_localized (
        id SERIAL PRIMARY KEY,
        product_id TEXT NOT NULL,
        original_url TEXT NOT NULL,
        locale TEXT NOT NULL,
        localized_url TEXT,
        hide_for_locale INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(product_id, original_url, locale)
      )
    `);

    // Create indexes for product_image_localized
    await client.query(`CREATE INDEX IF NOT EXISTS idx_image_localized_product ON product_image_localized(product_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_image_localized_locale ON product_image_localized(locale)`);

    await client.query("COMMIT");
    log("[AI DB] Tables initialized successfully");
  } catch (err) {
    await client.query("ROLLBACK");
    log(`[AI DB] Error initializing tables: ${err.message}`);
    throw err;
  } finally {
    client.release();
  }
}

// ===== AI EMBEDDINGS =====

async function getEmbedding(docId) {
  const result = await pool.query(
    "SELECT * FROM ai_embeddings WHERE doc_id = $1",
    [docId]
  );
  return result.rows[0] || null;
}

async function getAllEmbeddings() {
  const result = await pool.query("SELECT * FROM ai_embeddings");
  return result.rows;
}

async function getEmbeddingHashes() {
  const result = await pool.query("SELECT doc_id, content_hash FROM ai_embeddings");
  const map = {};
  result.rows.forEach(r => { map[r.doc_id] = r.content_hash; });
  return map;
}

async function upsertEmbedding(docId, contentHash, contentText, embeddingJson) {
  await pool.query(
    `INSERT INTO ai_embeddings (doc_id, content_hash, content_text, embedding_json, updated_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT (doc_id) DO UPDATE SET
       content_hash = $2,
       content_text = $3,
       embedding_json = $4,
       updated_at = CURRENT_TIMESTAMP`,
    [docId, contentHash, contentText, embeddingJson]
  );
}

async function deleteEmbedding(docId) {
  await pool.query("DELETE FROM ai_embeddings WHERE doc_id = $1", [docId]);
}

async function deleteEmbeddingsNotIn(docIds) {
  if (!docIds || docIds.length === 0) {
    await pool.query("DELETE FROM ai_embeddings");
    return;
  }
  
  const placeholders = docIds.map((_, i) => `$${i + 1}`).join(",");
  const result = await pool.query(
    `DELETE FROM ai_embeddings WHERE doc_id NOT IN (${placeholders})`,
    docIds
  );
  return result.rowCount;
}

async function getEmbeddingsCount() {
  const result = await pool.query("SELECT COUNT(*) as count FROM ai_embeddings");
  return parseInt(result.rows[0].count, 10);
}

// ===== AI JOBS =====

async function createJob(type) {
  const result = await pool.query(
    "INSERT INTO ai_jobs (type, status, created_at) VALUES ($1, 'queued', CURRENT_TIMESTAMP) RETURNING id",
    [type]
  );
  return result.rows[0].id;
}

async function getJob(id) {
  const result = await pool.query("SELECT * FROM ai_jobs WHERE id = $1", [id]);
  return result.rows[0] || null;
}

async function updateJob(id, updates) {
  const fields = [];
  const values = [];
  let paramIndex = 1;

  if (updates.status) {
    fields.push(`status = $${paramIndex}`);
    values.push(updates.status);
    paramIndex++;
  }
  if (updates.started_at) {
    fields.push(`started_at = $${paramIndex}`);
    values.push(updates.started_at);
    paramIndex++;
  }
  if (updates.finished_at) {
    fields.push(`finished_at = $${paramIndex}`);
    values.push(updates.finished_at);
    paramIndex++;
  }
  if (updates.error !== undefined) {
    fields.push(`error = $${paramIndex}`);
    values.push(updates.error);
    paramIndex++;
  }
  if (updates.stats_json !== undefined) {
    fields.push(`stats_json = $${paramIndex}`);
    values.push(updates.stats_json);
    paramIndex++;
  }

  if (fields.length === 0) return;

  values.push(id);
  await pool.query(
    `UPDATE ai_jobs SET ${fields.join(", ")} WHERE id = $${paramIndex}`,
    values
  );
}

async function getRecentJobs(limit = 20) {
  const result = await pool.query(
    "SELECT * FROM ai_jobs ORDER BY created_at DESC LIMIT $1",
    [limit]
  );
  return result.rows;
}

async function getQueuedJob() {
  const result = await pool.query(
    "SELECT * FROM ai_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1"
  );
  return result.rows[0] || null;
}

async function hasRunningJob() {
  const result = await pool.query(
    "SELECT id FROM ai_jobs WHERE status = 'running' LIMIT 1"
  );
  return !!result.rows[0];
}

async function getLastCompletedJob() {
  const result = await pool.query(
    "SELECT * FROM ai_jobs WHERE status IN ('done', 'failed') ORDER BY finished_at DESC LIMIT 1"
  );
  return result.rows[0] || null;
}

// ===== ENRICHMENT JOB LOCKING =====

async function acquireEnrichLock() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    // Check if there's any non-terminal enrich job (running, cancelling, idle, pending)
    const blocking = await client.query(
      "SELECT id, status FROM ai_jobs WHERE type = 'enrich' AND status NOT IN ('done', 'failed', 'cancelled', 'completed') FOR UPDATE"
    );
    
    if (blocking.rows.length > 0) {
      await client.query("ROLLBACK");
      return { success: false, error: `Another enrich job is already active (status: ${blocking.rows[0].status})`, jobId: blocking.rows[0].id };
    }
    
    // Create new job with lock - explicitly reset cancel_requested to FALSE
    const result = await client.query(
      `INSERT INTO ai_jobs (type, status, created_at, started_at, progress, total, last_heartbeat, cancel_requested)
       VALUES ('enrich', 'running', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 0, CURRENT_TIMESTAMP, FALSE)
       RETURNING id`
    );
    
    await client.query("COMMIT");
    return { success: true, jobId: result.rows[0].id };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function releaseEnrichLock(jobId, finalStatus, error = null, statsJson = null) {
  await pool.query(
    `UPDATE ai_jobs SET 
       status = $2, 
       finished_at = CURRENT_TIMESTAMP, 
       updated_at = CURRENT_TIMESTAMP,
       error = $3,
       stats_json = $4
     WHERE id = $1`,
    [jobId, finalStatus, error, statsJson]
  );
}

async function updateEnrichProgress(jobId, progress, total, statsJson = null) {
  await pool.query(
    `UPDATE ai_jobs SET 
       progress = $2, 
       total = $3, 
       last_heartbeat = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP,
       stats_json = COALESCE($4, stats_json)
     WHERE id = $1`,
    [jobId, progress, total, statsJson]
  );
}

async function requestEnrichCancel(jobId) {
  const result = await pool.query(
    `UPDATE ai_jobs SET 
       cancel_requested = TRUE, 
       status = 'cancelling',
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status IN ('running', 'idle')
     RETURNING id`,
    [jobId]
  );
  return result.rowCount > 0;
}

async function isEnrichCancelRequested(jobId) {
  const result = await pool.query(
    "SELECT cancel_requested FROM ai_jobs WHERE id = $1",
    [jobId]
  );
  return result.rows[0]?.cancel_requested || false;
}

async function getEnrichJobStatus(jobId) {
  const result = await pool.query(
    "SELECT * FROM ai_jobs WHERE id = $1",
    [jobId]
  );
  return result.rows[0] || null;
}

async function getRunningEnrichJob() {
  const result = await pool.query(
    "SELECT * FROM ai_jobs WHERE type = 'enrich' AND status IN ('running', 'cancelling') ORDER BY started_at DESC LIMIT 1"
  );
  return result.rows[0] || null;
}

async function getRecentEnrichJobs(limit = 10) {
  const result = await pool.query(
    "SELECT * FROM ai_jobs WHERE type = 'enrich' ORDER BY created_at DESC LIMIT $1",
    [limit]
  );
  return result.rows;
}

async function checkDbReady() {
  try {
    const result = await Promise.race([
      pool.query("SELECT 1 as ok"),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), 1000))
    ]);
    return { ready: true, latency: 'ok' };
  } catch (err) {
    return { ready: false, error: err.message };
  }
}

// ===== PRODUCT SEO LOCALIZED =====

async function getSeoLocalized(productId, locale) {
  const result = await pool.query(
    "SELECT * FROM product_seo_localized WHERE product_id = $1 AND locale = $2",
    [productId, locale]
  );
  return result.rows[0] || null;
}

async function getAllSeoForProduct(productId) {
  const result = await pool.query(
    "SELECT * FROM product_seo_localized WHERE product_id = $1 ORDER BY locale",
    [productId]
  );
  return result.rows;
}

async function getAllSeoForLocale(locale, status = null) {
  let query = "SELECT * FROM product_seo_localized WHERE locale = $1";
  const params = [locale];
  
  if (status) {
    query += " AND status = $2";
    params.push(status);
  }
  
  const result = await pool.query(query, params);
  return result.rows;
}

async function upsertSeoLocalized(productId, locale, data) {
  const existing = await getSeoLocalized(productId, locale);

  if (existing) {
    const lockedFields = existing.locked_fields_json ? JSON.parse(existing.locked_fields_json) : [];
    const updates = { ...data };
    for (const field of lockedFields) {
      delete updates[field];
    }

    const fields = [];
    const values = [];
    let paramIndex = 1;
    const allowedFields = ['seo_title', 'meta_description', 'h1', 'bullets_json', 'faqs_json',
                          'alt_texts_json', 'og_title', 'og_description', 'jsonld', 'keywords_json',
                          'status', 'locked_fields_json'];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && !lockedFields.includes(key)) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (fields.length === 0) return existing;

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(existing.id);

    const result = await pool.query(
      `UPDATE product_seo_localized SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0];
  } else {
    const columns = ['product_id', 'locale'];
    const placeholders = ['$1', '$2'];
    const values = [productId, locale];
    let paramIndex = 3;

    const allowedFields = ['seo_title', 'meta_description', 'h1', 'bullets_json', 'faqs_json',
                          'alt_texts_json', 'og_title', 'og_description', 'jsonld', 'keywords_json',
                          'status', 'locked_fields_json'];

    for (const [key, value] of Object.entries(data)) {
      if (allowedFields.includes(key) && value !== undefined) {
        columns.push(key);
        placeholders.push(`$${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    const result = await pool.query(
      `INSERT INTO product_seo_localized (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
      values
    );
    return result.rows[0];
  }
}

async function lockSeoField(productId, locale, fieldName) {
  const seo = await getSeoLocalized(productId, locale);
  if (!seo) return null;

  const lockedFields = seo.locked_fields_json ? JSON.parse(seo.locked_fields_json) : [];
  if (!lockedFields.includes(fieldName)) {
    lockedFields.push(fieldName);
  }

  await pool.query(
    "UPDATE product_seo_localized SET locked_fields_json = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
    [JSON.stringify(lockedFields), seo.id]
  );
  return lockedFields;
}

async function unlockSeoField(productId, locale, fieldName) {
  const seo = await getSeoLocalized(productId, locale);
  if (!seo) return null;

  const lockedFields = seo.locked_fields_json ? JSON.parse(seo.locked_fields_json) : [];
  const newLocked = lockedFields.filter(f => f !== fieldName);

  await pool.query(
    "UPDATE product_seo_localized SET locked_fields_json = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
    [JSON.stringify(newLocked), seo.id]
  );
  return newLocked;
}

async function deleteSeoLocalized(productId, locale) {
  const result = await pool.query(
    "DELETE FROM product_seo_localized WHERE product_id = $1 AND locale = $2",
    [productId, locale]
  );
  return result.rowCount;
}

async function getSeoStats() {
  const result = await pool.query(`
    SELECT
      COUNT(DISTINCT product_id) as total,
      COUNT(*) as "totalEntries",
      SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
      SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as drafts
    FROM product_seo_localized
  `);
  const row = result.rows[0] || {};
  return {
    total: parseInt(row.total, 10) || 0,
    totalEntries: parseInt(row.totalEntries, 10) || 0,
    published: parseInt(row.published, 10) || 0,
    drafts: parseInt(row.drafts, 10) || 0
  };
}

// ===== PRODUCT IMAGE AUDIT =====

async function getImageAudit(productId, imageUrl) {
  const result = await pool.query(
    "SELECT * FROM product_image_audit WHERE product_id = $1 AND image_url = $2",
    [productId, imageUrl]
  );
  return result.rows[0] || null;
}

async function getImageAuditsForProduct(productId) {
  const result = await pool.query(
    "SELECT * FROM product_image_audit WHERE product_id = $1 ORDER BY id",
    [productId]
  );
  return result.rows;
}

async function getInfographicImages(lang = null) {
  let query = "SELECT * FROM product_image_audit WHERE is_infographic = 1";
  const params = [];

  if (lang) {
    query += " AND detected_lang = $1";
    params.push(lang);
  }

  const result = await pool.query(query, params);
  return result.rows;
}

async function upsertImageAudit(productId, imageUrl, data) {
  const existing = await getImageAudit(productId, imageUrl);

  if (existing) {
    const fields = ["updated_at = CURRENT_TIMESTAMP"];
    const values = [];
    let paramIndex = 1;

    if (data.has_text !== undefined) { fields.push(`has_text = $${paramIndex}`); values.push(data.has_text ? 1 : 0); paramIndex++; }
    if (data.detected_lang !== undefined) { fields.push(`detected_lang = $${paramIndex}`); values.push(data.detected_lang); paramIndex++; }
    if (data.confidence !== undefined) { fields.push(`confidence = $${paramIndex}`); values.push(data.confidence); paramIndex++; }
    if (data.is_infographic !== undefined) { fields.push(`is_infographic = $${paramIndex}`); values.push(data.is_infographic ? 1 : 0); paramIndex++; }
    if (data.ocr_text !== undefined) { fields.push(`ocr_text = $${paramIndex}`); values.push(data.ocr_text); paramIndex++; }

    values.push(existing.id);

    const result = await pool.query(
      `UPDATE product_image_audit SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0];
  } else {
    const result = await pool.query(
      `INSERT INTO product_image_audit (product_id, image_url, has_text, detected_lang, confidence, is_infographic, ocr_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [productId, imageUrl, data.has_text ? 1 : 0, data.detected_lang || null, data.confidence || 0, data.is_infographic ? 1 : 0, data.ocr_text || null]
    );
    return result.rows[0];
  }
}

async function deleteImageAudit(productId, imageUrl) {
  const result = await pool.query(
    "DELETE FROM product_image_audit WHERE product_id = $1 AND image_url = $2",
    [productId, imageUrl]
  );
  return result.rowCount;
}

async function deleteImageAuditsForProduct(productId) {
  const result = await pool.query(
    "DELETE FROM product_image_audit WHERE product_id = $1",
    [productId]
  );
  return result.rowCount;
}

async function getImageAuditStats() {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN has_text = 1 THEN 1 ELSE 0 END) as with_text,
      SUM(CASE WHEN is_infographic = 1 THEN 1 ELSE 0 END) as infographics,
      COUNT(DISTINCT product_id) as products_audited
    FROM product_image_audit
  `);
  const row = result.rows[0] || {};
  return {
    total: parseInt(row.total, 10) || 0,
    with_text: parseInt(row.with_text, 10) || 0,
    infographics: parseInt(row.infographics, 10) || 0,
    products_audited: parseInt(row.products_audited, 10) || 0
  };
}

// ===== PRODUCT IMAGE LOCALIZED =====

async function getImageLocalizedOverride(productId, imageUrl, locale) {
  const result = await pool.query(
    "SELECT * FROM product_image_localized WHERE product_id = $1 AND original_url = $2 AND locale = $3",
    [productId, imageUrl, locale]
  );
  return result.rows[0] || null;
}

async function getImageLocalizedForProduct(productId, locale) {
  const result = await pool.query(
    "SELECT * FROM product_image_localized WHERE product_id = $1 AND locale = $2",
    [productId, locale]
  );
  return result.rows;
}

async function upsertImageLocalized(productId, originalUrl, locale, data) {
  const existing = await getImageLocalizedOverride(productId, originalUrl, locale);

  if (existing) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (data.localized_url !== undefined) { fields.push(`localized_url = $${paramIndex}`); values.push(data.localized_url); paramIndex++; }
    if (data.hide_for_locale !== undefined) { fields.push(`hide_for_locale = $${paramIndex}`); values.push(data.hide_for_locale ? 1 : 0); paramIndex++; }

    if (fields.length === 0) return existing;
    values.push(existing.id);

    const result = await pool.query(
      `UPDATE product_image_localized SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0];
  } else {
    const result = await pool.query(
      `INSERT INTO product_image_localized (product_id, original_url, locale, localized_url, hide_for_locale)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [productId, originalUrl, locale, data.localized_url || null, data.hide_for_locale ? 1 : 0]
    );
    return result.rows[0];
  }
}

async function deleteImageLocalized(productId, imageUrl, locale) {
  const result = await pool.query(
    "DELETE FROM product_image_localized WHERE product_id = $1 AND original_url = $2 AND locale = $3",
    [productId, imageUrl, locale]
  );
  return result.rowCount;
}

module.exports = {
  initAITables,
  getEmbedding,
  getAllEmbeddings,
  getEmbeddingHashes,
  upsertEmbedding,
  deleteEmbedding,
  deleteEmbeddingsNotIn,
  getEmbeddingsCount,
  createJob,
  getJob,
  updateJob,
  getRecentJobs,
  getQueuedJob,
  hasRunningJob,
  getLastCompletedJob,
  acquireEnrichLock,
  releaseEnrichLock,
  updateEnrichProgress,
  requestEnrichCancel,
  isEnrichCancelRequested,
  getEnrichJobStatus,
  getRunningEnrichJob,
  getRecentEnrichJobs,
  checkDbReady,
  getSeoLocalized,
  getAllSeoForProduct,
  getAllSeoForLocale,
  upsertSeoLocalized,
  lockSeoField,
  unlockSeoField,
  deleteSeoLocalized,
  getSeoStats,
  getImageAudit,
  getImageAuditsForProduct,
  getInfographicImages,
  upsertImageAudit,
  deleteImageAudit,
  deleteImageAuditsForProduct,
  getImageAuditStats,
  getImageLocalizedOverride,
  getImageLocalizedForProduct,
  upsertImageLocalized,
  deleteImageLocalized
};
