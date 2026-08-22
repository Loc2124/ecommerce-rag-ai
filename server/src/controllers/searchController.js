const { performSearch } = require("../services/ai/search");

const searchQuotaStore = new Map();
const SEARCH_LIMIT_PER_MINUTE = 30;
const SEARCH_WINDOW_MS = 60000;
const MAX_QUERY_LENGTH = 500;
const MAX_SEARCH_QUOTA_KEYS = 10000;

function enforceSearchRateLimit(clientKey) {
  const now = Date.now();
  if (
    searchQuotaStore.size >= MAX_SEARCH_QUOTA_KEYS &&
    !searchQuotaStore.has(clientKey)
  ) {
    for (const [key, timestamps] of searchQuotaStore) {
      if (!timestamps.some((timestamp) => now - timestamp < SEARCH_WINDOW_MS)) {
        searchQuotaStore.delete(key);
        break;
      }
    }
    if (searchQuotaStore.size >= MAX_SEARCH_QUOTA_KEYS) {
      searchQuotaStore.delete(searchQuotaStore.keys().next().value);
    }
  }
  const recent = (searchQuotaStore.get(clientKey) || []).filter(
    (timestamp) => now - timestamp < SEARCH_WINDOW_MS,
  );

  if (recent.length >= SEARCH_LIMIT_PER_MINUTE) {
    const oldest = recent[0];
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((SEARCH_WINDOW_MS - (now - oldest)) / 1000),
      ),
    };
  }

  recent.push(now);
  searchQuotaStore.set(clientKey, recent);
  return { allowed: true };
}

async function searchProductsController(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    const mode = String(req.query.mode || "hybrid").toLowerCase();
    const alpha = Number(req.query.alpha ?? 0.5);
    const requestedLimit = Number(req.query.limit ?? 5);

    if (!q) {
      return res
        .status(400)
        .json({ error: "Missing or empty query param `q`" });
    }

    if (q.length > MAX_QUERY_LENGTH) {
      return res.status(400).json({
        error: `Query must not exceed ${MAX_QUERY_LENGTH} characters`,
      });
    }

    if (!["keyword", "vector", "hybrid"].includes(mode)) {
      return res.status(400).json({
        error: "mode must be keyword, vector, or hybrid",
      });
    }

    const quota = enforceSearchRateLimit(req.ip || "unknown");
    if (!quota.allowed) {
      res.set("Retry-After", String(quota.retryAfterSeconds));
      return res.status(429).json({ error: "Too many search requests" });
    }

    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
      return res.status(400).json({ error: "alpha must be between 0 and 1" });
    }
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 50)
      : 5;

    const result = await performSearch(
      q,
      mode,
      Number.isFinite(alpha) ? alpha : 0.5,
      limit,
    );
    return res.json({
      results: result.results || [],
      cache_hit: Boolean(result.cacheHit),
      mode,
    });
  } catch (err) {
    console.error("Error in /api/search:", err);
    return res.status(500).json({ error: "Search service unavailable" });
  }
}

module.exports = { searchProductsController };
