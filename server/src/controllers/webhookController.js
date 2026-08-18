const {
  resolveOrderId,
  syncPaymentWebhookStatus,
  verifyPayOSSignature,
} = require("../services/webhookService");

function buildResponse(success, message, data = null, error = null) {
  return {
    success,
    message,
    data,
    error,
  };
}

async function paymentWebhookController(req, res) {
  try {
    const payload = req.body || {};
    const providerData =
      payload.data && typeof payload.data === "object" ? payload.data : payload;
    const {
      order_id,
      order_code,
      transaction_id = payload.payment_id || providerData.reference,
      amount = providerData.amount,
      signature,
      status = providerData.code === "00" ? "PAID" : payload.status,
    } = payload;

    if (
      (!order_id && !order_code) ||
      !status ||
      !["PAID", "PENDING", "CANCELLED", "EXPIRED"].includes(status)
    ) {
      return res.status(400).json(
        buildResponse(false, "Missing required fields", null, {
          code: "INVALID_WEBHOOK",
        }),
      );
    }

    if (!verifyPayOSSignature(payload)) {
      return res.status(401).json(
        buildResponse(false, "Invalid webhook signature", null, {
          code: "INVALID_WEBHOOK_SIGNATURE",
        }),
      );
    }

    const resolvedOrderId = await resolveOrderId(
      order_id,
      order_code || providerData.orderCode,
    );
    const result = await syncPaymentWebhookStatus(
      resolvedOrderId,
      transaction_id,
      status,
      amount,
      payload,
    );

    return res.json(
      buildResponse(true, "Webhook processed successfully", result),
    );
  } catch (err) {
    console.error("Error processing payment webhook:", err);
    const status = err.message?.includes("Order not found") ? 404 : 500;
    return res.status(status).json(
      buildResponse(false, err.message || "Internal error", null, {
        code: "WEBHOOK_FAILED",
      }),
    );
  }
}

module.exports = {
  paymentWebhookController,
};
