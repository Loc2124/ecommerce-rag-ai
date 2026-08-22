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

  const { data: existingMapping, error: mappingLookupError } = await supabase
    .from("orders")
    .select(
      "payos_order_code, payos_payment_link_id, payos_checkout_url, payos_qr_code, payment_link_state, payment_link_claimed_at, expires_at",
    )
    .eq("id", order.id)
    .maybeSingle();
  if (mappingLookupError) throw mappingLookupError;
  const claimIsFresh =
    existingMapping?.payment_link_claimed_at &&
    Date.now() - new Date(existingMapping.payment_link_claimed_at).getTime() <
      5 * 60 * 1000;
  if (existingMapping?.payment_link_state === "creating" && claimIsFresh) {
    throw new Error("A payment link is already being created for this order");
  }
  if (
    existingMapping?.payos_order_code &&
    existingMapping.payos_payment_link_id
  ) {
    return {
      order_id: order.id,
      order_code: existingMapping.payos_order_code,
      checkout_url: existingMapping.payos_checkout_url,
      payment_link_id: existingMapping.payos_payment_link_id,
      qr_code: existingMapping.payos_qr_code,
      expires_at: existingMapping.expires_at || order.expires_at,
      reused: true,
    };
  }

  const claimTimestamp = new Date().toISOString();
  const staleClaimAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: claimedOrder, error: claimError } = await supabase
    .from("orders")
    .update({
      payment_link_state: "creating",
      payment_link_claimed_at: claimTimestamp,
    })
    .eq("id", order.id)
    .eq("status", "pending")
    .or(
      `payment_link_state.is.null,and(payment_link_state.eq.creating,payment_link_claimed_at.lt.${staleClaimAt})`,
    )
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimedOrder) {
    throw new Error("A payment link is already being created for this order");
  }

  const cancelUrl = process.env.PAYOS_CANCEL_URL;
  const returnUrl = process.env.PAYOS_RETURN_URL;
  if (!cancelUrl || !returnUrl) {
    await supabase
      .from("orders")
      .update({ payment_link_state: null, payment_link_claimed_at: null })
      .eq("id", order.id)
      .eq("payment_link_state", "creating")
      .eq("payment_link_claimed_at", claimTimestamp);
    throw new Error("PayOS return and cancel URLs are not configured");
  }

  const orderCode = Number(`${Date.now()}${Math.floor(Math.random() * 10)}`);
  const amount = Math.round(Number(order.total));
  const description = `Order ${orderId.slice(0, 8)}`;
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

  let response;
  let result;
  try {
    response = await fetch(PAYOS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": clientId,
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });
    result = await response.json();
  } catch (error) {
    await supabase
      .from("orders")
      .update({ payment_link_state: null, payment_link_claimed_at: null })
      .eq("id", order.id)
      .eq("payment_link_state", "creating")
      .eq("payment_link_claimed_at", claimTimestamp);
    throw error;
  }

  if (!response.ok || result.code !== "00") {
    await supabase
      .from("orders")
      .update({ payment_link_state: null, payment_link_claimed_at: null })
      .eq("id", order.id)
      .eq("payment_link_state", "creating")
      .eq("payment_link_claimed_at", claimTimestamp);
    throw new Error(result.desc || "PayOS payment link creation failed");
  }

  const paymentLinkId = result.data?.paymentLinkId || null;
  const { data: mappedOrder, error: mappingError } = await supabase
    .from("orders")
    .update({
      payos_order_code: orderCode,
      payos_payment_link_id: paymentLinkId,
      payos_checkout_url: result.data?.checkoutUrl || null,
      payos_qr_code: result.data?.qrCode || null,
      payment_link_state: "ready",
      payment_link_claimed_at: null,
    })
    .eq("id", order.id)
    .eq("status", "pending")
    .eq("payment_link_state", "creating")
    .eq("payment_link_claimed_at", claimTimestamp);
  if (mappingError || !mappedOrder) {
    await supabase
      .from("orders")
      .update({ payment_link_state: null, payment_link_claimed_at: null })
      .eq("id", order.id)
      .eq("payment_link_state", "creating")
      .eq("payment_link_claimed_at", claimTimestamp);
    throw (
      mappingError || new Error("Payment link could not be mapped to order")
    );
  }

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
