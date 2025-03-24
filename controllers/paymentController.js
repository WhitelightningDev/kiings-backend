const axios = require("axios");
const Payment = require("../models/Payment");
require("dotenv").config(); // Ensure your Yoco secret key is stored in `.env`

const YOCO_SECRET_KEY = process.env.YOCO_SECRET_KEY;

/**
 * Initiate a Yoco payment checkout session
 */
exports.createPayment = async (req, res) => {
  try {
    const { userId, bookingId, amount } = req.body;

    if (!userId || !bookingId || !amount) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Create a Yoco checkout session
    const yocoResponse = await axios.post(
      "https://payments.yoco.com/api/checkouts",
      {
        amountInCents: amount * 100, // Convert to cents
        currency: "ZAR",
        redirectUrl: "https://yourwebsite.com/payment-success",
      },
      {
        headers: { Authorization: `Bearer ${YOCO_SECRET_KEY}` },
      }
    );

    if (yocoResponse.data && yocoResponse.data.id) {
      // Save payment in DB with status "pending"
      const payment = new Payment({
        userId,
        bookingId,
        amount,
        yocoSessionId: yocoResponse.data.id,
        paymentStatus: "pending",
      });

      await payment.save();

      res.json({ redirectUrl: yocoResponse.data.redirectUrl });
    } else {
      res.status(500).json({ error: "Failed to create Yoco session" });
    }
  } catch (error) {
    console.error("Error creating payment:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

/**
 * Handle Yoco payment confirmation (Webhook)
 */
exports.confirmPayment = async (req, res) => {
  try {
    const { sessionId, status } = req.body;

    if (!sessionId || !status) {
      return res.status(400).json({ error: "Invalid request data" });
    }

    const payment = await Payment.findOne({ yocoSessionId: sessionId });

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // Update payment status based on Yoco response
    payment.paymentStatus = status === "successful" ? "successful" : "failed";
    await payment.save();

    res.json({ message: "Payment status updated successfully" });
  } catch (error) {
    console.error("Error confirming payment:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
