const { collectDiagnostics } = require('./diagnostics');
const { loadReport, saveTriage } = require('./storage');
const { SAFE_ACTIONS, getActionDescription } = require('./allowlist');
const { FIX_ACTIONS } = require('./types');

const LOG_BUFFER_MAX = 500;
let logBuffer = [];

function bufferLog(line) {
  logBuffer.push({ ts: Date.now(), line });
  if (logBuffer.length > LOG_BUFFER_MAX) {
    logBuffer = logBuffer.slice(-LOG_BUFFER_MAX);
  }
}

function getRecentLogs(maxLines = 300) {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  return logBuffer
    .filter(l => l.ts > tenMinutesAgo)
    .slice(-maxLines)
    .map(l => l.line);
}

async function runTriage(options = {}) {
  const { note = '' } = options;
  
  const diagnostics = await collectDiagnostics();
  const lastReport = loadReport();
  const recentLogs = getRecentLogs(300);
  
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return {
      ok: false,
      error: 'OPENAI_API_KEY not configured',
      diagnostics,
      timestamp: new Date().toISOString()
    };
  }

  const systemPrompt = `You are a webshop reliability engineer for GetPawsy, a pet e-commerce platform.

Analyze the provided diagnostics, test report, and server logs to identify issues and produce a JSON fix plan.

Your response MUST be valid JSON with exactly these fields:
{
  "rootCause": "string describing the main issue(s)",
  "confidence": "high|medium|low",
  "recommendedFixes": [{"type": "ACTION_TYPE", "description": "what it does", "priority": 1-5}],
  "safeFixes": [{"type": "ACTION_TYPE", "payload": {}}],
  "codePatchSuggestion": "unified diff string if code changes needed, otherwise null",
  "verificationSteps": ["step 1", "step 2"]
}

Available safe fix action types:
- DISABLE_NON_PET_PRODUCTS: Disable non-pet products (socks, chairs, etc.)
- REASSIGN_CATEGORY: Normalize miscategorized products
- REBUILD_RESOLVED_IMAGES: Rebuild resolved_image from available sources
- ENABLE_REMOTE_IMAGE_FALLBACK: Enable remote image fallback
- REGENERATE_SEO_FOR_MISSING: Queue SEO regeneration for products missing descriptions
- RECALC_PRICES: Recalculate suspicious product prices
- CLEAR_CACHE_REINDEX: Clear caches and rebuild indexes

Focus on:
1. Cart functionality issues (state, persistence)
2. Image resolution problems (missing, placeholders)
3. Pet-only filtering failures (non-pet products visible)
4. Admin authentication problems
5. Product data integrity

Only suggest code patches for issues that cannot be fixed with data/config changes.`;

  const userPrompt = `DIAGNOSTICS:
${JSON.stringify(diagnostics, null, 2)}

LAST TEST REPORT:
${lastReport ? JSON.stringify(lastReport, null, 2) : 'No test report available'}

RECENT SERVER LOGS (last 10 minutes):
${recentLogs.join('\n') || 'No recent logs'}

${note ? `ADMIN NOTE: ${note}` : ''}

Analyze and produce your JSON fix plan.`;

  try {
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: openaiApiKey });
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    let triageResult;
    
    try {
      triageResult = JSON.parse(content);
    } catch (parseErr) {
      triageResult = {
        rootCause: 'Failed to parse AI response',
        confidence: 'low',
        recommendedFixes: [],
        safeFixes: [],
        codePatchSuggestion: null,
        verificationSteps: ['Manually review diagnostics'],
        rawResponse: content
      };
    }

    const result = {
      ok: true,
      timestamp: new Date().toISOString(),
      model: 'gpt-4o-mini',
      diagnosticsSnapshot: diagnostics,
      reportSnapshot: lastReport ? { summary: lastReport.summary } : null,
      triage: triageResult
    };

    saveTriage(result);
    return result;

  } catch (error) {
    console.error('[Triage] OpenAI call failed:', error.message);
    return {
      ok: false,
      error: error.message,
      diagnostics,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  runTriage,
  bufferLog,
  getRecentLogs
};
