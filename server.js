import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import moment from 'moment';
import axios from 'axios';
import mongoose from 'mongoose';
import { config } from 'dotenv';
import { sendBookingEmails } from './controllers/emailController.js';

config();

const app = express();
const port = process.env.PORT || 3030;

const allowedOrigins = ['https://kiings.vercel.app', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: 'GET,POST,PUT,DELETE',
  allowedHeaders: 'Content-Type,Authorization',
  credentials: true,
}));

app.use(bodyParser.json());

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Import Booking and Payment models
import Booking from './models/Booking.js';
import Payment from './models/Payment.js';

// Helper to generate 30-min slots between 8am and 6pm
function generateAvailableSlots(date) {
  const start = moment(date).set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
  const end = moment(date).set({ hour: 18, minute: 0, second: 0, millisecond: 0 });
  const slots = [];

  let current = start.clone();

  while (current.isBefore(end)) {
    slots.push(current.format('HH:mm'));
    current.add(30, 'minutes');
  }

  return slots;
}

// GET available slots
app.get('/api/available-slots', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Date is required' });

  try {
    const allSlots = generateAvailableSlots(date);
    const booked = await Booking.find({ date }).select('time').lean();
    const bookedSlots = booked.map(b => b.time);

    const available = allSlots.filter(slot => !bookedSlots.includes(slot));

    res.json(available);
  } catch (error) {
    console.error('Error fetching slots:', error);
    res.status(500).json({ error: 'Server error fetching slots' });
  }
});

// POST booking and initiate payment
app.post('/api/book', async (req, res) => {
  try {
    const {
      firstName, lastName, carModel, washType, additionalServices,
      date, time, email, subscription, serviceLocation, address, totalPrice,
    } = req.body;

    if (!totalPrice || isNaN(Number(totalPrice)) || Number(totalPrice) <= 0) {
      return res.status(400).json({ error: 'Invalid total price' });
    }

    const newBooking = new Booking({
      firstName, lastName, carModel, washType, additionalServices,
      date, time, email, subscription, serviceLocation, address,
      totalPrice,
      paymentStatus: 'Pending',
    });

    const savedBooking = await newBooking.save();

    await sendBookingEmails({
      firstName, lastName, email, carModel,
      washType: washType?.name,
      date, time,
      totalPrice,
    });

    const yocoPayload = {
      amountInCents: Math.round(Number(totalPrice) * 100),
      currency: 'ZAR',
      redirectUrl: `https://kiings.vercel.app/#/success?bookingId=${savedBooking._id}`,
      cancelUrl: `https://kiings.vercel.app/#/paymentcanceled?bookingId=${savedBooking._id}`,
    };

    const yocoResponse = await axios.post(
      'https://payments.yoco.com/api/checkouts',
      yocoPayload,
      {
        headers: {
          Authorization: `Bearer ${process.env.YOCO_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (yocoResponse.data?.redirectUrl) {
      await new Payment({
        bookingId: savedBooking._id,
        amount: Number(totalPrice),
        yocoSessionId: yocoResponse.data.id,
        paymentStatus: 'pending',
      }).save();

      return res.json({ redirectUrl: yocoResponse.data.redirectUrl });
    }

    return res.status(500).json({ error: 'Failed to retrieve Yoco checkout URL' });
  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({ error: 'Payment initiation failed' });
  }
});

// POST payment confirmation webhook
app.post('/api/payments/confirm', async (req, res) => {
  const { sessionId, status } = req.body;

  if (!sessionId || !status) {
    return res.status(400).json({ error: 'Invalid request data' });
  }

  try {
    const payment = await Payment.findOne({ yocoSessionId: sessionId });

    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    if (payment.paymentStatus === 'successful') {
      return res.json({ message: 'Payment already processed' });
    }

    payment.paymentStatus = status === 'successful' ? 'successful' : 'failed';
    await payment.save();

    if (status === 'successful') {
      const booking = await Booking.findByIdAndUpdate(
        payment.bookingId,
        { paymentStatus: 'Paid' },
        { new: true }
      );

      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      try {
        await sendBookingEmails({
          firstName: booking.firstName,
          lastName: booking.lastName,
          email: booking.email,
          carModel: booking.carModel,
          washType: booking.washType?.name,
          date: booking.date,
          time: booking.time,
          totalPrice: payment.amount,
        });
      } catch (emailError) {
        console.error('Error sending payment confirmation emails:', emailError);
      }
    }

    res.json({ message: 'Payment status updated successfully' });
  } catch (error) {
    console.error('Error in payment confirmation:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET bookings by email
app.get('/api/my-bookings', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const bookings = await Booking.find({ email });
    res.json(bookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Server error fetching bookings' });
  }
});

// GET all bookings
app.get('/api/all-bookings', async (req, res) => {
  try {
    const bookings = await Booking.find();
    res.json(bookings);
  } catch (error) {
    console.error('Error fetching all bookings:', error);
    res.status(500).json({ error: 'Server error fetching bookings' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${port}`);
});
