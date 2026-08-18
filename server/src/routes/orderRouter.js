const express = require("express");
const {
  createOrderController,
  listOrdersController,
  getOrderController,
  cancelOrderController,
} = require("../controllers/orderController");
const requireAuth = require("../middleware/requireAuth");

const orderRouter = express.Router();

orderRouter.post("/api/orders", requireAuth, createOrderController);
orderRouter.get("/api/orders", requireAuth, listOrdersController);
orderRouter.get("/api/orders/:orderId", requireAuth, getOrderController);
orderRouter.put(
  "/api/orders/:orderId/cancel",
  requireAuth,
  cancelOrderController,
);

module.exports = orderRouter;
