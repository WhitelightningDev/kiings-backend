import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import moment from 'moment';
import axios from 'axios';
import { connect, Schema, model } from 'mongoose';
import { config } from 'dotenv';
import { sendBookingEmails } from './controllers/emailController.js';

// Load environment variables
config();

const app = express();
const port = process.env.PORT || 3030;

// Frontend base URL used for Yoco redirects
// Default to deployed Vercel frontend; can be overridden via CLIENT_BASE_URL env var
const rawClientBaseUrl =
  process.env.CLIENT_BASE_URL || 'https://kiingsvipcarwash.vercel.app';
const isLiveYocoKey = (process.env.YOCO_SECRET_KEY || '').startsWith('sk_live_');
const clientBaseUrl =
  isLiveYocoKey && rawClientBaseUrl.startsWith('http://')
    ? rawClientBaseUrl.replace('http://', 'https://')
    : rawClientBaseUrl;

// Middleware
const allowedOrigins = [
  'https://kiings.vercel.app',
  'https://kiingsvipcarwash.vercel.app',
  'http://localhost:3000',
  'http://localhost:4200',
  'http://127.0.0.1:4200',
];

app.use(
  cors({
    origin(origin, callback) {
      // allow requests with no origin (like mobile apps, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    methods: 'GET,POST,PUT,DELETE',
    allowedHeaders: 'Content-Type,Authorization',
    credentials: true,
  }),
);

app.use(bodyParser.json());

// MongoDB connection
const mongoURI = process.env.MONGO_URI;

if (!mongoURI) {
  console.error('MONGO_URI environment variable is not set');
  process.exit(1);
}

connect(mongoURI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('Error connecting to MongoDB:', err);
    process.exit(1);
  });

// Define Booking model
const bookingSchema = new Schema({
  firstName: String,
  lastName: String,
  carModel: String,
  washType: {
    name: String,
    price: Number,
    details: String,
  },
  additionalServices: [
    {
      name: String,
      price: Number,
    },
  ],
  date: String,
  time: String,
  email: String,
  subscription: String,
  serviceLocation: String,
  address: String,
  paymentStatus: { type: String, default: 'Pending' },
});

const Booking = model('Booking', bookingSchema);

// Define Payment model
const paymentSchema = new Schema({
  bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
  amount: { type: Number, required: true },
  yocoSessionId: { type: String, required: true },
  paymentStatus: { type: String, enum: ['pending', 'successful', 'failed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
});

const Payment = model('Payment', paymentSchema);

// Static catalog for add-on services (shared with frontend)
const ADD_ON_CATALOG = [
  {
    id: 'interior',
    label: 'Interior Cleans Only – Vacuum, air vents, dashboard shine, door panels',
    price: 100,
  },
  {
    id: 'leather',
    label: 'Leather Clean – Nourish & protect leather surfaces',
    price: 50,
  },
  {
    id: 'ceramic',
    label: 'Ceramic Infused Spray – Hydrophobic shine & protection',
    price: 150,
  },
  {
    id: 'headlight',
    label: 'Headlight Restoration – Restores clarity to headlights',
    price: 200,
  },
  {
    id: 'bodygloss',
    label: 'Body Gloss – Enhances depth & glossy finish',
    price: 100,
  },
];

// Generate available time slots
function generateAvailableSlots(date) {
  const workingHoursStart = moment(date).set('hour', 8).set('minute', 0);
  const workingHoursEnd = moment(date).set('hour', 19).set('minute', 0); // 8:00–19:00

  const slots = [];
  let currentSlot = workingHoursStart;

  while (currentSlot.isBefore(workingHoursEnd)) {
    // Use 12-hour time with AM/PM (e.g. "08:00 AM") to match existing frontend expectations
    slots.push(currentSlot.format('hh:mm A'));
    currentSlot = currentSlot.add(30, 'minutes');
  }

  return slots;
}

// Expose add-ons catalog
app.get('/api/addons', (req, res) => {
  res.json(ADD_ON_CATALOG);
});


// Fetch available slots
app.get('/api/available-slots', async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  const allSlots = generateAvailableSlots(date);

  try {
    const bookedTimes = await Booking.find({ date }).select('time').lean();
    const bookedTimeSlots = bookedTimes.map((booking) => booking.time);
    const availableTimes = allSlots.filter((slot) => !bookedTimeSlots.includes(slot));

    return res.json(availableTimes);
  } catch (error) {
    console.error('Error fetching available slots:', error);
    // Fallback: return full slot list instead of 500 so the frontend continues to work
    return res.json(allSlots);
  }
});

// Book a car wash and optionally initiate online payment
app.post('/api/book', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      carModel,
      washType,
      additionalServices,
      date,
      time,
      email,
      subscription,
      serviceLocation,
      address,
      totalPrice,
      payment,
    } = req.body;

    if (!totalPrice || Number.isNaN(Number(totalPrice)) || Number(totalPrice) <= 0) {
      return res.status(400).json({ error: 'Invalid total price' });
    }

    const paymentMethod = payment?.method || 'card';
    console.log('Incoming booking request', {
      paymentMethod,
      totalPrice,
      hasPaymentObject: Boolean(payment),
    });
    const amountInCents = Math.round(Number(totalPrice) * 100);

    const newBooking = new Booking({
      firstName,
      lastName,
      carModel,
      washType,
      additionalServices,
      date,
      time,
      email,
      subscription,
      serviceLocation,
      address,
      paymentStatus: 'Pending',
    });

    const savedBooking = await newBooking.save();

    // For pay-on-site / EFT bookings, just persist and send confirmation email
    if (paymentMethod !== 'card') {
      try {
        await sendBookingEmails({
          firstName: savedBooking.firstName,
          lastName: savedBooking.lastName,
          email: savedBooking.email,
          carModel: savedBooking.carModel,
          washType: savedBooking.washType?.name,
          date: savedBooking.date,
          time: savedBooking.time,
          totalPrice,
        });
      } catch (emailError) {
        console.error('Failed to send booking emails for offline payment:', emailError);
      }

      return res.status(201).json({
        message: 'Booking created successfully',
        bookingId: savedBooking._id,
      });
    }

    const yocoPayload = {
      amount: amountInCents,
      currency: 'ZAR',
      reference: `Booking_${savedBooking._id}`,
      successUrl: `${clientBaseUrl}/booking-success?bookingId=${savedBooking._id}`,
      cancelUrl: `${clientBaseUrl}/payment-canceled?bookingId=${savedBooking._id}`,
    };

    console.log('Initiating Yoco checkout with payload', yocoPayload);

    const yocoResponse = await axios.post('https://payments.yoco.com/api/checkouts', yocoPayload, {
      headers: {
        Authorization: `Bearer ${process.env.YOCO_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (yocoResponse.data.redirectUrl) {
      await new Payment({
        bookingId: savedBooking._id,
        amount: amountInCents,
        yocoSessionId: yocoResponse.data.id,
        paymentStatus: 'pending',
      }).save();

      return res.json({ redirectUrl: yocoResponse.data.redirectUrl });
    }

    return res.status(500).json({ error: 'Failed to retrieve Yoco checkout URL' });
  } catch (error) {
    // Log full error including response if Yoco returned one
    if (error.response) {
      console.error('Booking/payment initiation failed with response:', {
        status: error.response.status,
        data: error.response.data,
      });
    } else {
      console.error('Booking/payment initiation failed:', error);
    }

    res.status(500).json({
      error: 'Payment initiation failed',
      details: error.response?.data || null,
    });
  }
});

// Payment confirmation webhook — ONLY here emails are sent for card payments
app.post('/api/payments/confirm', async (req, res) => {
  try {
    const { sessionId, status } = req.body;
    if (!sessionId || !status) return res.status(400).json({ error: 'Invalid request data' });

    const payment = await Payment.findOne({ yocoSessionId: sessionId });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    payment.paymentStatus = status === 'successful' ? 'successful' : 'failed';
    await payment.save();

    if (status === 'successful') {
      const updatedBooking = await Booking.findByIdAndUpdate(
        payment.bookingId,
        { paymentStatus: 'Paid' },
        { new: true },
      );

      if (updatedBooking) {
        await sendBookingEmails({
          firstName: updatedBooking.firstName,
          lastName: updatedBooking.lastName,
          email: updatedBooking.email,
          carModel: updatedBooking.carModel,
          washType: updatedBooking.washType?.name,
          date: updatedBooking.date,
          time: updatedBooking.time,
          totalPrice: payment.amount / 100, // convert cents to Rands
        });
      }
    }

    res.json({ message: 'Payment status updated successfully' });
  } catch (error) {
    console.error('Payment confirmation failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/bookings/send-confirmation', async (req, res) => {
  const { bookingId } = req.body;
  if (!bookingId) return res.status(400).json({ error: 'Booking ID is required' });

  try {
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    await sendBookingEmails({
      firstName: booking.firstName,
      lastName: booking.lastName,
      email: booking.email,
      carModel: booking.carModel,
      washType: booking.washType?.name,
      date: booking.date,
      time: booking.time,
      totalPrice: null,
    });

    res.json({ message: 'Confirmation email sent' });
  } catch (error) {
    console.error('Failed to send confirmation email:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Cancel a booking by ID
app.delete('/api/cancel-booking/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const booking = await Booking.findById(id);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    await Booking.findByIdAndDelete(id);
    return res.status(200).json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    return res.status(500).json({ error: 'Error cancelling booking' });
  }
});

// Fetch bookings
app.get('/api/my-bookings', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  res.json(await Booking.find({ email }));
});

app.get('/api/all-bookings', async (req, res) => {
  res.json(await Booking.find());
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${port}`);
});
