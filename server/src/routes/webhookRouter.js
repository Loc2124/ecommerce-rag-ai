const express = require("express");
const {
  paymentWebhookController,
} = require("../controllers/webhookController");

const webhookRouter = express.Router();

webhookRouter.post("/webhook/payment", paymentWebhookController);

module.exports = webhookRouter;
