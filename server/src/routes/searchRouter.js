const express = require("express");
const { searchProductsController } = require("../controllers/searchController");

const searchRouter = express.Router();

searchRouter.get("/api/search", searchProductsController);

module.exports = searchRouter;
