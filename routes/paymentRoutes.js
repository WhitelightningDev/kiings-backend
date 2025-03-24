const express = require("express");
const { createPayment, confirmPayment } = require("../controllers/paymentController");

const router = express.Router();

router.post("/pay", createPayment); // Initiate Payment
router.post("/confirm", confirmPayment); // Confirm Payment (Webhook)

module.exports = router;
