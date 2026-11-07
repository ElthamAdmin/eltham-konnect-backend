const express = require("express");
const router = express.Router();

// Freight API integrations are retired.
// Kajay Warehousing currently uses the manual workflow.
router.use((req, res) => {
  return res.status(410).json({
    success: false,
    message:
      "This freight integration has been discontinued. " +
      "Contact Eltham Konnect for current shipment arrangements.",
  });
});

module.exports = router;