const express = require("express");
const {
  checkEmailController,
  registerController,
  loginController,
  meController,
} = require("../controllers/authController");
const requireAuth = require("../middleware/requireAuth");

const authRouter = express.Router();

authRouter.get("/api/auth/check-email", checkEmailController);
authRouter.post("/api/auth/register", registerController);
authRouter.post("/api/auth/login", loginController);
authRouter.get("/api/me", requireAuth, meController);

module.exports = authRouter;
