require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const YOCO_SECRET_KEY = process.env.YOCO_SECRET_KEY;
const MERCHANT_EMAIL = "booking.kiingscarwas@gmail.com"; // Replace with actual email

// Handle Booking & Redirect to Yoco
app.post("/api/book", async (req, res) => {
  try {
    const { firstName, lastName, email, totalPrice } = req.body;

    // Create Yoco payment session
    const yocoResponse = await axios.post(
      "https://online.yoco.com/api/payments",
      {
        amountInCents: totalPrice * 100, // Convert to cents
        currency: "ZAR",
        reference: `Booking_${Date.now()}`,
        successUrl: "http://localhost:3000/success", // Update with actual frontend URL
        cancelUrl: "http://localhost:3000/cancel",
      },
      {
        headers: {
          Authorization: `Bearer ${YOCO_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Send Yoco redirect URL
    res.json({ redirectUrl: yocoResponse.data.checkoutUrl });
  } catch (error) {
    console.error("Yoco Payment Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Payment initiation failed" });
  }
});

// Handle Yoco Payment Success
app.post("/api/payment-success", async (req, res) => {
  try {
    const { email, firstName, lastName, totalPrice } = req.body;

    // Send confirmation emails
    await sendEmail(email, "Booking Confirmation", `Your booking is confirmed.`);
    await sendEmail(MERCHANT_EMAIL, "New Booking", `A new booking has been made by ${firstName} ${lastName}.`);

    res.json({ message: "Payment successful & emails sent" });
  } catch (error) {
    console.error("Email Sending Error:", error.message);
    res.status(500).json({ error: "Failed to send confirmation email" });
  }
});

// Email function
async function sendEmail(to, subject, text) {
  let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
  });
}

app.listen(5000, () => console.log("Server running on port 5000"));
