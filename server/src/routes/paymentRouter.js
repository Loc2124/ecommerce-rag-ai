const express = require("express");
const {
  createPaymentLinkController,
} = require("../controllers/paymentController");
const requireAuth = require("../middleware/requireAuth");

const paymentRouter = express.Router();

paymentRouter.post(
  "/api/payments/:orderId/create-link",
  requireAuth,
  createPaymentLinkController,
);

module.exports = paymentRouter;
