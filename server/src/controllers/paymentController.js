const { createPaymentLink } = require("../services/paymentService");

function buildResponse(success, message, data = null, error = null) {
  return { success, message, data, error };
}

async function createPaymentLinkController(req, res) {
  try {
    const data = await createPaymentLink(
      req.params.orderId,
      req.user?.id,
      req.body || {},
    );
    return res
      .status(201)
      .json(buildResponse(true, "Payment link created", data));
  } catch (err) {
    const message = err.message || "Payment link creation failed";
    const status = message.includes("Forbidden")
      ? 403
      : message.includes("not found")
        ? 404
        : 400;
    return res
      .status(status)
      .json(
        buildResponse(false, message, null, { code: "PAYMENT_CREATE_FAILED" }),
      );
  }
}

module.exports = { createPaymentLinkController };
