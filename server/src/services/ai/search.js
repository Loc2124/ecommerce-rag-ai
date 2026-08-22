// server/src/services/ai/search.js
const { createClient } = require("@supabase/supabase-js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check server/.env",
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const searchCache = new Map();
const SEARCH_CACHE_TTL_MS = Number(process.env.SEARCH_CACHE_TTL_MS) || 60000;
const SEARCH_CACHE_MAX_ENTRIES = 500;

function buildCacheKey(queryText, mode, alpha, matchCount) {
  return `${queryText.trim().toLowerCase()}|${mode}|${alpha}|${matchCount}`;
}

function getCachedSearch(cacheKey) {
  const cached = searchCache.get(cacheKey);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    searchCache.delete(cacheKey);
    return null;
  }

  return {
    results: cached.results,
    queryVector: cached.queryVector,
    cacheHit: true,
  };
}

function setCachedSearch(cacheKey, results, queryVector) {
  if (searchCache.size >= SEARCH_CACHE_MAX_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) searchCache.delete(oldestKey);
  }

  searchCache.set(cacheKey, {
    results,
    queryVector,
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
  });
}

/**
 * Thực hiện tìm kiếm Hybrid
 * @param {string} queryText - Câu hỏi của khách hàng
 * @param {number} alpha - Trọng số (0.5 mặc định)
 */
async function generateQueryEmbedding(queryText) {
  const embeddingModelName =
    process.env.EMBEDDING_MODEL || "models/gemini-embedding-001";
  console.log(`🔎 Using embedding model for search: ${embeddingModelName}`);
  const model = genAI.getGenerativeModel({ model: embeddingModelName });
  const result = await model.embedContent(queryText);
  const queryVector = result?.embedding?.values;
  const expectedDimension = Number(process.env.EMBEDDING_DIM) || 3072;

  if (!Array.isArray(queryVector) || queryVector.length !== expectedDimension) {
    throw new Error(
      `Embedding dimension mismatch: expected ${expectedDimension}, got ${Array.isArray(queryVector) ? queryVector.length : typeof queryVector}`,
    );
  }

  return queryVector;
}

async function performSearch(
  queryText,
  mode = "hybrid",
  alpha = 0.5,
  matchCount = 5,
  queryVector = null,
) {
  const normalizedQuery = String(queryText || "").trim();
  const normalizedMode = String(mode || "hybrid").toLowerCase();
  if (!["keyword", "vector", "hybrid"].includes(normalizedMode)) {
    throw new Error("mode must be keyword, vector, or hybrid");
  }
  const normalizedAlpha = Number.isFinite(alpha) ? alpha : 0.5;
  const normalizedMatchCount = Number.isFinite(matchCount)
    ? Math.max(1, Number(matchCount))
    : 5;
  const cacheKey = buildCacheKey(
    normalizedQuery,
    normalizedMode,
    normalizedAlpha,
    normalizedMatchCount,
  );
  const cached = getCachedSearch(cacheKey);
  if (cached) return cached;

  try {
    const vector =
      normalizedMode === "keyword"
        ? null
        : queryVector || (await generateQueryEmbedding(normalizedQuery));

    const { data, error } = await supabase.rpc("search_products_by_mode", {
      p_query_text: normalizedQuery,
      p_query_embedding: vector,
      p_mode: normalizedMode,
      p_alpha: normalizedAlpha,
      p_match_count: normalizedMatchCount,
    });

    if (error) throw error;

    // Map RPC return `prod_id` or `product_id` to `id` for downstream consumers
    const mapped = (data || []).map((row) => {
      const out = { ...row };
      if (out.prod_id && !out.id) {
        out.id = out.prod_id;
        delete out.prod_id;
      }
      if (out.product_id && !out.id) {
        out.id = out.product_id;
        delete out.product_id;
      }
      return out;
    });

    setCachedSearch(cacheKey, mapped, vector);
    return { results: mapped, queryVector: vector, cacheHit: false };
  } catch (error) {
    console.error("Lỗi Hybrid Search:", error.message);
    throw error;
  }
}

module.exports = {
  performSearch,
  generateQueryEmbedding,
  performHybridSearch: (queryText, alpha = 0.5, matchCount = 5) =>
    performSearch(queryText, "hybrid", alpha, matchCount),
};
