const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const { parsePagination } = require("../utils/pagination");

async function logAdminEvent(
  userId,
  action,
  resourceType,
  resourceId,
  details = null,
) {
  try {
    await supabase.from("admin_events").insert({
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details: details || {},
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn(
      "Warning: could not log admin event:",
      error?.message || error,
    );
  }
}

async function getAdminEvents({ page = 1, limit = 100 } = {}) {
  const pagination = parsePagination(page, limit, 100);
  const safePage = pagination.page;
  const safeLimit = pagination.limit;
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  const { data, error, count } = await supabase
    .from("admin_events")
    .select(
      "id, user_id, action, resource_type, resource_id, details, created_at, users(id, full_name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  return {
    events: data || [],
    page: safePage,
    limit: safeLimit,
    total: count || 0,
  };
}

module.exports = {
  logAdminEvent,
  getAdminEvents,
};
