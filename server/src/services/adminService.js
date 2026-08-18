const { createClient } = require("@supabase/supabase-js");
const { getCronJobStatus } = require("./webhookService");
const { parsePagination } = require("../utils/pagination");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function getAllOrders({ page = 1, limit = 50, status = null } = {}) {
  const pagination = parsePagination(page, limit, 50);
  const safePage = pagination.page;
  const safeLimit = pagination.limit;
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  let query = supabase
    .from("orders")
    .select(
      "id, user_id, status, payment_method, total, expires_at, payos_order_code, payos_payment_link_id, created_at, updated_at, order_items(id, order_id, product_id, quantity, price_at_order, products(id, category_id, sku, name, description, attributes, price, stock, is_active, created_at, updated_at)), payments(id, order_id, transaction_id, provider, status, amount, created_at), users(id, full_name)",
      {
        count: "exact",
      },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    orders: data || [],
    page: safePage,
    limit: safeLimit,
    total: count || 0,
  };
}

async function updateOrderStatusAdmin(orderId, newStatus) {
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!order) throw new Error("Order not found");

  const validTransitions = {
    pending: ["cancelled"],
    confirmed: ["shipped", "cancelled"],
    shipped: ["completed"],
    completed: [],
    cancelled: [],
  };

  const allowed = validTransitions[order.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid status transition from '${order.status}' to '${newStatus}'`,
    );
  }

  if (newStatus === "cancelled") {
    const { data: cancelResult, error: cancelError } = await supabase.rpc(
      "cancel_and_restock_order",
      { p_order_id: orderId, p_new_status: "cancelled" },
    );
    if (cancelError) throw cancelError;
    if (cancelResult !== "cancelled") {
      throw new Error(`Unable to cancel order: ${cancelResult}`);
    }
  } else {
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);
    if (updateError) throw updateError;
  }

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, user_id, status, payment_method, total, expires_at, payos_order_code, payos_payment_link_id, created_at, updated_at, order_items(id, order_id, product_id, quantity, price_at_order, products(id, category_id, sku, name, description, attributes, price, stock, is_active, created_at, updated_at)), payments(id, order_id, transaction_id, provider, status, amount, created_at)",
    )
    .eq("id", orderId)
    .single();
  if (error) throw error;
  return data;
}

async function getAnalytics() {
  const [chatStats, productStats, orderStats, cronStatus] = await Promise.all([
    getChatAnalytics(),
    getProductAnalytics(),
    getOrderAnalytics(),
    getCronJobStatus(),
  ]);

  return {
    chat: chatStats,
    products: productStats,
    orders: orderStats,
    cron_status: cronStatus,
    timestamp: new Date().toISOString(),
  };
}

async function getChatAnalytics() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const { data: chatLogs, error } = await supabase
    .from("chat_logs")
    .select("used_rag, latency_ms, cache_hit")
    .gte("created_at", twentyFourHoursAgo.toISOString());

  if (error) throw error;

  const total = chatLogs.length;
  const fallbackCount = chatLogs.filter((log) => log.used_rag === false).length;
  const avgLatency =
    total > 0
      ? chatLogs.reduce((sum, log) => sum + (log.latency_ms || 0), 0) / total
      : 0;

  const cacheHitCount = chatLogs.filter((log) => log.cache_hit).length;

  return {
    total_queries_24h: total,
    fallback_count: fallbackCount,
    fallback_rate:
      total > 0 ? ((fallbackCount / total) * 100).toFixed(2) + "%" : "0%",
    avg_latency_ms: Math.round(avgLatency),
    cache_hit_count: cacheHitCount,
    cache_hit_rate:
      total > 0 ? ((cacheHitCount / total) * 100).toFixed(2) + "%" : "0%",
  };
}

async function getProductAnalytics() {
  const { data: products, error } = await supabase
    .from("products")
    .select("embedding_status, is_active");

  if (error) throw error;

  const total = products.length;
  const activeCount = products.filter((p) => p.is_active).length;
  const embedReadyCount = products.filter(
    (p) => p.embedding_status === "ready",
  ).length;
  const embedFailCount = products.filter(
    (p) => p.embedding_status === "failed",
  ).length;

  return {
    total_products: total,
    active_products: activeCount,
    embedding_ready: embedReadyCount,
    embedding_failed: embedFailCount,
    embedding_ready_rate:
      total > 0 ? ((embedReadyCount / total) * 100).toFixed(2) + "%" : "0%",
  };
}

async function getOrderAnalytics() {
  const { data: orders, error } = await supabase
    .from("orders")
    .select("status, total");

  if (error) throw error;

  const total = orders.length;
  const statusCount = {};
  let totalRevenue = 0;

  orders.forEach((order) => {
    statusCount[order.status] = (statusCount[order.status] || 0) + 1;
    totalRevenue += Number(order.total || 0);
  });

  return {
    total_orders: total,
    status_breakdown: statusCount,
    total_revenue: totalRevenue.toFixed(2),
  };
}

module.exports = {
  getAllOrders,
  updateOrderStatusAdmin,
  getAnalytics,
  getChatAnalytics,
  getProductAnalytics,
  getOrderAnalytics,
  getCronJobStatus,
};
