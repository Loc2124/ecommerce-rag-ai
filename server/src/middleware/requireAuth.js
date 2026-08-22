const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing SUPABASE_URL or auth key. Check server/.env");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.replace("Bearer ", "")
      : null;

    if (!token) {
      return res.status(401).json({ error: "Unauthorized: missing token" });
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ error: "Unauthorized: invalid token" });
    }

    req.user = data.user;
    return next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res
      .status(500)
      .json({ error: "Authentication service unavailable" });
  }
}

module.exports = requireAuth;
