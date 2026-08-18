const express = require("express");
const {
  adminListOrdersController,
  adminUpdateOrderStatusController,
  adminAnalyticsController,
  adminEventsController,
} = require("../controllers/adminController");
const requireAuth = require("../middleware/requireAuth");

const adminRouter = express.Router();

adminRouter.get("/api/admin/orders", requireAuth, adminListOrdersController);
adminRouter.put(
  "/api/admin/orders/:orderId/status",
  requireAuth,
  adminUpdateOrderStatusController,
);
adminRouter.get("/api/admin/analytics", requireAuth, adminAnalyticsController);
adminRouter.get("/api/admin/events", requireAuth, adminEventsController);

module.exports = adminRouter;
