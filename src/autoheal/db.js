const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

function generateCorrelationId() {
  return `ah_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

async function createAction({ actor, level, action, mode, targetCount, diffJson, correlationId }) {
  const result = await pool.query(`
    INSERT INTO autoheal_actions (actor, level, action, mode, target_count, diff_json, status, correlation_id)
    VALUES ($1, $2, $3, $4, $5, $6, 'planned', $7)
    RETURNING id, ts, status
  `, [actor || 'system', level, action, mode, targetCount || 0, JSON.stringify(diffJson || {}), correlationId]);
  return result.rows[0];
}

async function updateActionStatus(actionId, status, errorDetails = null) {
  await pool.query(`
    UPDATE autoheal_actions 
    SET status = $1, error_details = $2, updated_at = NOW()
    WHERE id = $3
  `, [status, errorDetails, actionId]);
}

async function createSnapshot(actionId, tableName, rowKey, beforeJson) {
  await pool.query(`
    INSERT INTO autoheal_snapshots (action_id, table_name, row_key, before_json)
    VALUES ($1, $2, $3, $4)
  `, [actionId, tableName, rowKey, JSON.stringify(beforeJson)]);
}

async function getSnapshotsForAction(actionId) {
  const result = await pool.query(`
    SELECT * FROM autoheal_snapshots 
    WHERE action_id = $1 
    ORDER BY id ASC
  `, [actionId]);
  return result.rows;
}

async function getAction(actionId) {
  const result = await pool.query(`
    SELECT * FROM autoheal_actions WHERE id = $1
  `, [actionId]);
  return result.rows[0];
}

async function getRecentActions(limit = 20) {
  const result = await pool.query(`
    SELECT * FROM autoheal_actions 
    ORDER BY ts DESC 
    LIMIT $1
  `, [limit]);
  return result.rows;
}

async function getLastAppliedAction() {
  const result = await pool.query(`
    SELECT * FROM autoheal_actions 
    WHERE mode = 'apply' AND status IN ('applied', 'failed')
    ORDER BY ts DESC 
    LIMIT 1
  `);
  return result.rows[0];
}

async function logAlert({ type, severity, payload }) {
  const result = await pool.query(`
    INSERT INTO alerts_log (type, severity, payload_json)
    VALUES ($1, $2, $3)
    RETURNING id, ts
  `, [type, severity, JSON.stringify(payload)]);
  return result.rows[0];
}

async function markAlertNotified(alertId, channel) {
  if (channel === 'slack') {
    await pool.query(`UPDATE alerts_log SET notified_slack = TRUE WHERE id = $1`, [alertId]);
  } else if (channel === 'email') {
    await pool.query(`UPDATE alerts_log SET notified_email = TRUE WHERE id = $1`, [alertId]);
  }
}

async function getRecentAlerts(limit = 50) {
  const result = await pool.query(`
    SELECT * FROM alerts_log 
    ORDER BY ts DESC 
    LIMIT $1
  `, [limit]);
  return result.rows;
}

async function approveLevel2(approvedBy, confirmationText) {
  const result = await pool.query(`
    INSERT INTO autoheal_level2_approvals (approved_by, confirmation_text)
    VALUES ($1, $2)
    RETURNING id, approved_at
  `, [approvedBy, confirmationText]);
  return result.rows[0];
}

async function getLevel2Approval() {
  const result = await pool.query(`
    SELECT * FROM autoheal_level2_approvals 
    WHERE revoked_at IS NULL 
    ORDER BY approved_at DESC 
    LIMIT 1
  `);
  return result.rows[0];
}

async function revokeLevel2Approval(id, revokedBy) {
  await pool.query(`
    UPDATE autoheal_level2_approvals 
    SET revoked_at = NOW(), revoked_by = $2
    WHERE id = $1
  `, [id, revokedBy]);
}

async function getActionStats() {
  const result = await pool.query(`
    SELECT 
      COUNT(*) FILTER (WHERE status = 'applied') as applied_count,
      COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
      COUNT(*) FILTER (WHERE status = 'rolled_back') as rolled_back_count,
      COUNT(*) FILTER (WHERE mode = 'dry') as dry_run_count,
      MAX(ts) FILTER (WHERE mode = 'apply' AND status = 'applied') as last_apply_at
    FROM autoheal_actions
  `);
  return result.rows[0];
}

async function cleanupOldActions(retentionDays = 30) {
  const result = await pool.query(`
    DELETE FROM autoheal_actions 
    WHERE ts < NOW() - INTERVAL '${retentionDays} days'
    RETURNING id
  `);
  return result.rowCount;
}

async function cleanupOldAlerts(retentionDays = 7) {
  const result = await pool.query(`
    DELETE FROM alerts_log 
    WHERE ts < NOW() - INTERVAL '${retentionDays} days'
    RETURNING id
  `);
  return result.rowCount;
}

module.exports = {
  pool,
  generateCorrelationId,
  createAction,
  updateActionStatus,
  createSnapshot,
  getSnapshotsForAction,
  getAction,
  getRecentActions,
  getLastAppliedAction,
  logAlert,
  markAlertNotified,
  getRecentAlerts,
  approveLevel2,
  getLevel2Approval,
  revokeLevel2Approval,
  getActionStats,
  cleanupOldActions,
  cleanupOldAlerts
};
