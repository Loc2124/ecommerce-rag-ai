const { performHybridSearch } = require("../services/ai/search");

async function searchProductsController(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    const alpha = Number(req.query.alpha ?? 0.5);
    const limit = Number(req.query.limit ?? 5);

    if (!q) {
      return res
        .status(400)
        .json({ error: "Missing or empty query param `q`" });
    }

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
