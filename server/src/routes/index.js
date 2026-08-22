const express = require("express");
const aiRouter = require("./aiRouter");
const searchRouter = require("./searchRouter");
const authRouter = require("./authRouter");
const productRouter = require("./productRouter");
const orderRouter = require("./orderRouter");
const categoryRouter = require("./categoryRouter");
const adminRouter = require("./adminRouter");
const webhookRouter = require("./webhookRouter");
const paymentRouter = require("./paymentRouter");
const healthRouter = require("./healthRouter");

const router = express.Router();
router.use(aiRouter);
router.use(searchRouter);
router.use(authRouter);
router.use(productRouter);
router.use(orderRouter);
router.use(categoryRouter);
router.use(adminRouter);
router.use(webhookRouter);
router.use(paymentRouter);
router.use(healthRouter);

module.exports = router;
