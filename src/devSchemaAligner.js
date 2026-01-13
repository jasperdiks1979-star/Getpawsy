/**
 * DEV-ONLY Schema Aligner
 * 
 * This module aligns the development database schema with production to prevent
 * Replit's migration system from generating destructive DROP statements.
 * 
 * SAFETY:
 * - Only runs in workspace (REPL_SLUG=workspace)
 * - Only runs when ALLOW_DEV_DDL=true
 * - NEVER runs in production (NODE_ENV=production)
 * - Only uses CREATE TABLE IF NOT EXISTS (no DROP/ALTER)
 */

const { Pool } = require("pg");
const { log } = require("./logger");

// Use SSL only if PGHOST suggests external connection
const useSSL = process.env.PGHOST && !process.env.PGHOST.includes('localhost') && !process.env.PGHOST.includes('127.0.0.1');

const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: 3,
  connectionTimeoutMillis: 5000,
});

async function alignDevSchema() {
  // CRITICAL FIX: Schema aligner is DISABLED by default to prevent Replit schema conflicts
  // To enable, set ENABLE_AI_PG=1 AND ALLOW_DEV_DDL=true in environment
  if (process.env.ENABLE_AI_PG !== '1' && process.env.ENABLE_AI_PG !== 'true') {
    log("[DevSchema] ⏭️ Skipped: ENABLE_AI_PG not set (AI PostgreSQL disabled by default)");
    return { ok: false, error: "ENABLE_AI_PG must be '1' to enable AI PostgreSQL features" };
  }
  
  // CRITICAL: Block in production AND during deployment
  if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT || process.env.REPLIT_DEPLOYMENT_ID) {
    log("[DevSchema] ❌ BLOCKED: Cannot run in production or deployment");
    return { ok: false, error: "Blocked in production or deployment" };
  }
  
  // Only allow in workspace
  if (process.env.REPL_SLUG !== "workspace") {
    log("[DevSchema] ❌ BLOCKED: Only allowed in workspace (development)");
    return { ok: false, error: "Only allowed in workspace" };
  }
  
  // Require explicit flag
  if (process.env.ALLOW_DEV_DDL !== "true") {
    log("[DevSchema] ⏭️ Skipped: ALLOW_DEV_DDL not set to 'true'");
    return { ok: false, error: "ALLOW_DEV_DDL must be 'true'" };
  }
  
  log("[DevSchema] 🔧 Starting development schema alignment...");
  
  const client = await pool.connect();
  const created = [];
  const errors = [];
  
  try {
    // Table definitions matching production schema
    const tables = [
      {
        name: "ai_embeddings",
        sql: `CREATE TABLE IF NOT EXISTS ai_embeddings (
          doc_id TEXT PRIMARY KEY,
          content_hash TEXT NOT NULL,
          content_text TEXT NOT NULL,
          embedding_json TEXT NOT NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: "ai_jobs",
        sql: `CREATE TABLE IF NOT EXISTS ai_jobs (
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
        )`
      },
      {
        name: "product_seo_localized",
        sql: `CREATE TABLE IF NOT EXISTS product_seo_localized (
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
        )`
      },
      {
        name: "product_image_audit",
        sql: `CREATE TABLE IF NOT EXISTS product_image_audit (
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
        )`
      },
      {
        name: "product_image_localized",
        sql: `CREATE TABLE IF NOT EXISTS product_image_localized (
          id SERIAL PRIMARY KEY,
          product_id TEXT NOT NULL,
          original_url TEXT NOT NULL,
          locale TEXT NOT NULL,
          localized_url TEXT,
          status TEXT DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(product_id, original_url, locale)
        )`
      }
    ];
    
    for (const table of tables) {
      try {
        await client.query(table.sql);
        created.push(table.name);
        log(`[DevSchema] ✅ Created/verified: ${table.name}`);
      } catch (err) {
        errors.push({ table: table.name, error: err.message });
        log(`[DevSchema] ⚠️ Error with ${table.name}: ${err.message}`);
      }
    }
    
    log(`[DevSchema] ✅ Alignment complete: ${created.length} tables verified`);
    
    return {
      ok: errors.length === 0,
      created,
      errors: errors.length > 0 ? errors : undefined
    };
    
  } finally {
    client.release();
  }
}

async function checkSchemaStatus() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('ai_embeddings', 'ai_jobs', 'product_seo_localized', 'product_image_audit', 'product_image_localized')
      ORDER BY table_name
    `);
    
    const existingTables = result.rows.map(r => r.table_name);
    const requiredTables = ['ai_embeddings', 'ai_jobs', 'product_seo_localized', 'product_image_audit', 'product_image_localized'];
    const missing = requiredTables.filter(t => !existingTables.includes(t));
    
    return {
      ok: missing.length === 0,
      existing: existingTables,
      missing
    };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    client.release();
  }
}

module.exports = { alignDevSchema, checkSchemaStatus };
