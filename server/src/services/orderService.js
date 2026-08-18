const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const { parsePagination } = require("../utils/pagination");

// Valid status transitions
const STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["completed"],
  completed: [],
  cancelled: [],
};

async function createOrder(userId, { items, payment_method = "payos" } = {}) {
  if (!userId) throw new Error("userId is required");
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("At least one order item is required");
  }
  if (!["cod", "payos"].includes(payment_method)) {
    throw new Error("Invalid payment method");
  }

  const normalizedItems = items.map((item) => ({
    product_id: item?.product_id,
    quantity: Number(item?.quantity),
  }));

  const itemQuantities = new Map();
  for (const item of normalizedItems) {
    itemQuantities.set(
      item.product_id,
      (itemQuantities.get(item.product_id) || 0) + item.quantity,
    );
  }
  const aggregatedItems = Array.from(
    itemQuantities,
    ([product_id, quantity]) => ({
      product_id,
      quantity,
    }),
  );

  if (
    normalizedItems.some(
      (item) =>
        !item.product_id ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0,
    )
  ) {
    throw new Error("Each item requires a valid product_id and quantity");
  }

  const productIds = aggregatedItems.map((item) => item.product_id);
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, price, stock, is_active")
    .in("id", productIds);

  if (productsError) throw productsError;

  const productMap = new Map(
    (products || []).map((product) => [product.id, product]),
  );
  const orderItems = aggregatedItems.map((item) => {
    const product = productMap.get(item.product_id);
    if (!product || !product.is_active) {
      throw new Error(`Product not found: ${item.product_id}`);
    }
    if (Number(product.stock) < item.quantity) {
      throw new Error(`Insufficient stock for product: ${item.product_id}`);
    }

    return {
      product_id: product.id,
      quantity: item.quantity,
      price_at_order: Number(product.price),
    };
  });

  const { data: orderId, error: orderError } = await supabase.rpc(
    "create_order",
    {
      p_user_id: userId,
      p_items: aggregatedItems,
      p_payment_method: payment_method,
      p_hold_minutes: 15,
    },
  );

  if (orderError) throw orderError;
  return getOrderById(orderId);
}

function isValidStatusTransition(currentStatus, newStatus) {
  const allowed = STATUS_TRANSITIONS[currentStatus] || [];
  return allowed.includes(newStatus);
}

function normalizeOrder(order) {
  if (!order) return order;

  return {
    ...order,
    id: order.id,
    total: Number(order.total ?? 0),
    created_at: order.created_at,
    updated_at: order.updated_at,
  };
}

async function getOrders(userId, { page = 1, limit = 20 } = {}) {
  if (!userId) {
    throw new Error("userId is required");
  }

  const pagination = parsePagination(page, limit, 20);
  const safePage = pagination.page;
  const safeLimit = pagination.limit;
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, user_id, status, payment_method, total, expires_at, payos_order_code, payos_payment_link_id, created_at, updated_at, order_items(id, order_id, product_id, quantity, price_at_order, products(id, category_id, sku, name, description, attributes, price, stock, is_active, created_at, updated_at))",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  return (data || []).map(normalizeOrder);
}

async function getOrderById(orderId) {
  if (!orderId) {
    throw new Error("orderId is required");
  }

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, user_id, status, payment_method, total, expires_at, payos_order_code, payos_payment_link_id, created_at, updated_at, order_items(id, order_id, product_id, quantity, price_at_order, products(id, category_id, sku, name, description, attributes, price, stock, is_active, created_at, updated_at)), payments(id, order_id, transaction_id, provider, status, amount, created_at)",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return normalizeOrder(data);
}

async function validateOrderOwnership(orderId, userId) {
  const order = await getOrderById(orderId);

  if (!order) {
    throw new Error("Order not found");
  }

  if (order.user_id !== userId) {
    throw new Error("Forbidden: you do not own this order");
  }

  return order;
}

async function cancelOrder(orderId, userId) {
  const order = await validateOrderOwnership(orderId, userId);

  if (!isValidStatusTransition(order.status, "cancelled")) {
    throw new Error(
      `Cannot cancel order with status '${order.status}'. Only pending or confirmed orders can be cancelled.`,
    );
  }

  const { data: result, error } = await supabase.rpc(
    "cancel_and_restock_order",
    { p_order_id: orderId, p_new_status: "cancelled" },
  );
  if (error) throw error;
  if (result !== "cancelled")
    throw new Error(`Unable to cancel order: ${result}`);

  return getOrderById(orderId);
}

async function updateOrderStatus(orderId, newStatus) {
  const order = await getOrderById(orderId);

  if (!order) {
    throw new Error("Order not found");
  }

  if (!isValidStatusTransition(order.status, newStatus)) {
    throw new Error(
      `Invalid status transition from '${order.status}' to '${newStatus}'`,
    );
  }

  const { data, error } = await supabase
    .from("orders")
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .select(
      "id, user_id, status, payment_method, total, expires_at, payos_order_code, payos_payment_link_id, created_at, updated_at, order_items(id, order_id, product_id, quantity, price_at_order, products(id, category_id, sku, name, description, attributes, price, stock, is_active, created_at, updated_at)), payments(id, order_id, transaction_id, provider, status, amount, created_at)",
    )
    .single();

  if (error) throw error;

  return normalizeOrder(data);
}

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  validateOrderOwnership,
  cancelOrder,
  updateOrderStatus,
  isValidStatusTransition,
};
