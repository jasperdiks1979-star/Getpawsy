const sessions = {};
const carts = {};

function recordEvent(event) {
  const { sessionId, event: type, url, ts, depth, productId } = event;

  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      sessionId,
      created: ts,
      lastSeen: ts,
      pageviews: 0,
      scrollDepth: 0,
      currentUrl: url
    };
  }

  const s = sessions[sessionId];
  s.lastSeen = ts;
  s.currentUrl = url;

  if (type === "pageview") s.pageviews++;
  if (type === "scroll" && depth > s.scrollDepth) s.scrollDepth = depth;

  if (type === "add_to_cart") {
    if (!carts[sessionId]) carts[sessionId] = [];
    carts[sessionId].push({ productId, ts });
  }
}

function getRealtimeStats() {
  const now = Date.now();
  const active = Object.values(sessions).filter(s => now - s.lastSeen < 15000);

  return {
    activeUsers: active.length,
    sessions: active,
    carts,
  };
}

module.exports = { recordEvent, getRealtimeStats };
