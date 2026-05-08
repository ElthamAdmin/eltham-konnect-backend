const express = require("express");
const router = express.Router();

const integrationAuth = require("../middleware/integrationAuth");
const {
  receiveFreightPackage,
} = require("../controllers/integrationController");

router.post("/freight/packages", integrationAuth, receiveFreightPackage);

module.exports = router;