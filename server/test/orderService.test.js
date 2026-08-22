const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

const {
  createOrder,
  isValidStatusTransition,
} = require("../src/services/orderService");

test("allows the supported order status transitions", () => {
  const allowedTransitions = [
    ["pending", "confirmed"],
    ["pending", "cancelled"],
    ["confirmed", "shipped"],
    ["confirmed", "cancelled"],
    ["shipped", "completed"],
  ];

  for (const [currentStatus, newStatus] of allowedTransitions) {
    assert.equal(
      isValidStatusTransition(currentStatus, newStatus),
      true,
      `${currentStatus} -> ${newStatus} should be allowed`,
    );
  }
});

test("rejects invalid and terminal order status transitions", () => {
  const rejectedTransitions = [
    ["pending", "shipped"],
    ["confirmed", "completed"],
    ["shipped", "cancelled"],
    ["completed", "cancelled"],
    ["cancelled", "pending"],
    ["requires_refund", "cancelled"],
    ["unknown", "confirmed"],
  ];

  for (const [currentStatus, newStatus] of rejectedTransitions) {
    assert.equal(
      isValidStatusTransition(currentStatus, newStatus),
      false,
      `${currentStatus} -> ${newStatus} should be rejected`,
    );
  }
});

test("rejects invalid order input before database access", async () => {
  await assert.rejects(
    createOrder("user-id", { items: [] }),
    /At least one order item is required/,
  );
  await assert.rejects(
    createOrder("user-id", {
      items: [{ product_id: "product-id", quantity: 0 }],
    }),
    /Each item requires a valid product_id and quantity/,
  );
  await assert.rejects(
    createOrder("user-id", {
      items: [{ product_id: "product-id", quantity: 1 }],
      payment_method: "card",
    }),
    /Invalid payment method/,
  );
});
