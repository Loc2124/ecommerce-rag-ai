const express = require("express");
const aiRouter = require("./aiRouter");
const searchRouter = require("./searchRouter");
const authRouter = require("./authRouter");
const productRouter = require("./productRouter");

const router = express.Router();
router.use(aiRouter);
router.use(searchRouter);
router.use(authRouter);
router.use(productRouter);

module.exports = router;
