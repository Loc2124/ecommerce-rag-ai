const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { validateOrderOwnership } = require("./orderService");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const PAYOS_API_URL = "https://api-merchant.payos.vn/v2/payment-requests";

function createPayOSSignature({
  amount,
  cancelUrl,
  description,
  orderCode,
  returnUrl,
}) {
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY;
  if (!checksumKey) throw new Error("PAYOS_CHECKSUM_KEY is not configured");

  const data = [
    `amount=${amount}`,
    `cancelUrl=${cancelUrl}`,
    `description=${description}`,
    `orderCode=${orderCode}`,
    `returnUrl=${returnUrl}`,
  ].join("&");

  return crypto.createHmac("sha256", checksumKey).update(data).digest("hex");
}

async function createPaymentLink(orderId, userId, options = {}) {
  const clientId = process.env.PAYOS_CLIENT_ID;
  const apiKey = process.env.PAYOS_API_KEY;
  if (!clientId || !apiKey) {
    throw new Error("PayOS credentials are not configured");
  }

  const order = await validateOrderOwnership(orderId, userId);
  if (order.payment_method !== "payos") {
    throw new Error("This order does not use PayOS");
  }
  if (order.status !== "pending") {
    throw new Error("Only pending orders can create a payment link");
  }

  const orderCode = Number(`${Date.now()}${Math.floor(Math.random() * 10)}`);
  const amount = Math.round(Number(order.total));
  const description = `Order ${orderId.slice(0, 8)}`;
  const cancelUrl = options.cancel_url || process.env.PAYOS_CANCEL_URL;
  const returnUrl = options.return_url || process.env.PAYOS_RETURN_URL;

  if (!cancelUrl || !returnUrl) {
    throw new Error("PayOS return and cancel URLs are not configured");
  }

  const payload = {
    orderCode,
    amount,
    description,
    cancelUrl,
    returnUrl,
    signature: createPayOSSignature({
      amount,
      cancelUrl,
      description,
      orderCode,
      returnUrl,
    }),
  };

  const response = await fetch(PAYOS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-client-id": clientId,
      "x-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();

  if (!response.ok || result.code !== "00") {
    throw new Error(result.desc || "PayOS payment link creation failed");
  }

  const paymentLinkId = result.data?.paymentLinkId || null;
  const { error: mappingError } = await supabase
    .from("orders")
    .update({
      payos_order_code: orderCode,
      payos_payment_link_id: paymentLinkId,
    })
    .eq("id", order.id);
  if (mappingError) throw mappingError;

  return {
    order_id: order.id,
    order_code: orderCode,
    checkout_url: result.data?.checkoutUrl || null,
    payment_link_id: paymentLinkId,
    qr_code: result.data?.qrCode || null,
    expires_at: order.expires_at,
  };
}

module.exports = { createPaymentLink };
