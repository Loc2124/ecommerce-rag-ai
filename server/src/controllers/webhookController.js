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
    const hasSignedData =
      payload.data &&
      typeof payload.data === "object" &&
      !Array.isArray(payload.data);
    const providerData = hasSignedData ? payload.data : payload;
    const orderCode = providerData.orderCode || providerData.order_code;
    const transactionId = providerData.reference || providerData.transaction_id;
    const amount = providerData.amount;
    const status =
      providerData.status ||
      providerData.paymentStatus ||
      (providerData.code === "00" ? "PAID" : null);

    if (
      !orderCode ||
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

    const resolvedOrderId = await resolveOrderId(null, orderCode);
    const result = await syncPaymentWebhookStatus(
      resolvedOrderId,
      transactionId,
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
      buildResponse(
        false,
        status === 404 ? "Order not found" : "Webhook processing failed",
        null,
        {
          code: "WEBHOOK_FAILED",
        },
      ),
    );
  }
}

module.exports = {
  paymentWebhookController,
};
