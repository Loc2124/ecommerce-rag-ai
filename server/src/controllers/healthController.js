const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
);

async function healthController(req, res) {
  const checks = {
    supabase: "unknown",
    gemini: process.env.GEMINI_API_KEY ? "configured" : "not_configured",
    payos: "not_configured",
  };

  checks.payos =
    process.env.PAYOS_CLIENT_ID &&
    process.env.PAYOS_API_KEY &&
    process.env.PAYOS_CHECKSUM_KEY &&
    process.env.PAYOS_RETURN_URL &&
    process.env.PAYOS_CANCEL_URL
      ? "configured"
      : "not_configured";

  try {
    const { error } = await supabase.from("categories").select("id").limit(1);
    if (error) throw error;

    checks.supabase = "ok";
    return res.status(200).json({
      status: "ok",
      checks,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed:", error?.message || error);
    checks.supabase = "error";
    return res.status(503).json({
      status: "degraded",
      checks,
      timestamp: new Date().toISOString(),
      error: "Supabase health check failed",
    });
  }
}

module.exports = { healthController };
