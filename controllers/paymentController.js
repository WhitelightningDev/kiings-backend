const axios = require('axios');
const Payment = require('../models/Payment');
require('dotenv').config();

const YOCO_SECRET_KEY = process.env.YOCO_SECRET_KEY;

exports.createPayment = async (req, res) => {
  const { userId, bookingId, amount } = req.body;

  if (!userId || !bookingId || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const response = await axios.post(
      'https://payments.yoco.com/api/checkouts',
      {
        amountInCents: amount * 100,
        currency: 'ZAR',
        redirectUrl: 'https://yourwebsite.com/payment-success',
      },
      {
        headers: { Authorization: `Bearer ${YOCO_SECRET_KEY}` },
      }
    );

    const { data } = response;

    if (data?.id && data?.redirectUrl) {
      const payment = new Payment({
        userId,
        bookingId,
        amount,
        yocoSessionId: data.id,
        paymentStatus: 'pending',
      });

      await payment.save();

      return res.json({ redirectUrl: data.redirectUrl });
    } else {
      return res.status(500).json({ error: 'Failed to create Yoco session' });
    }
  } catch (error) {
    console.error('Error creating payment:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.confirmPayment = async (req, res) => {
  const { sessionId, status } = req.body;

  if (!sessionId || !status) {
    return res.status(400).json({ error: 'Invalid request data' });
  }

  try {
    const payment = await Payment.findOne({ yocoSessionId: sessionId });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    payment.paymentStatus = status === 'successful' ? 'successful' : 'failed';
    await payment.save();

    res.json({ message: 'Payment status updated successfully' });
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
