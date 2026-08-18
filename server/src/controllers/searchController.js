const { performHybridSearch } = require("../services/ai/search");

async function searchProductsController(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    const alpha = Number(req.query.alpha ?? 0.5);
    const requestedLimit = Number(req.query.limit ?? 5);

    if (!q) {
      return res
        .status(400)
        .json({ error: "Missing or empty query param `q`" });
    }

    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
      return res.status(400).json({ error: "alpha must be between 0 and 1" });
    }
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 50)
      : 5;

    const result = await performHybridSearch(
      q,
      Number.isFinite(alpha) ? alpha : 0.5,
      limit,
    );
    return res.json(result.results || []);
  } catch (err) {
    console.error("Error in /api/search:", err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}

module.exports = { searchProductsController };
