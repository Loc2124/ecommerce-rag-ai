const express = require("express");
const {
  registerController,
  loginController,
  refreshTokenController,
  updateProfileController,
  forgotPasswordController,
  changePasswordController,
  meController,
} = require("../controllers/authController");
const requireAuth = require("../middleware/requireAuth");
const { createRateLimiter } = require("../middleware/rateLimit");

const authRouter = express.Router();
const authRateLimit = createRateLimiter({ limit: 20, windowMs: 60000 });
const emailRateLimit = createRateLimiter({ limit: 10, windowMs: 60000 });
const passwordChangeRateLimit = createRateLimiter({
  limit: 5,
  windowMs: 15 * 60000,
  keyGenerator: (req) => req.user?.id || req.ip,
});

authRouter.post("/api/auth/register", authRateLimit, registerController);
authRouter.post("/api/auth/login", authRateLimit, loginController);
authRouter.post("/api/auth/refresh", authRateLimit, refreshTokenController);
authRouter.post(
  "/api/auth/forgot-password",
  emailRateLimit,
  forgotPasswordController,
);
authRouter.put(
  "/api/auth/change-password",
  requireAuth,
  passwordChangeRateLimit,
  changePasswordController,
);
authRouter.get("/api/me", requireAuth, meController);
authRouter.put("/api/me", requireAuth, updateProfileController);

module.exports = authRouter;
