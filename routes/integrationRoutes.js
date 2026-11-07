const express = require("express");
const router = express.Router();

router.use((req, res) => {
  return res.status(410).json({
    success: false,
    message: "This freight integration has been discontinued.",
  });
});

module.exports = router;