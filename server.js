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

// Middleware
const allowedOrigins = ["https://kiings.vercel.app", "http://localhost:3000"];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (like mobile apps, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error('Not allowed by CORS'));
      }
    },
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: "Content-Type,Authorization",
    credentials: true, // In case you need cookies or auth later
  })
);

app.use(bodyParser.json());

// MongoDB connection
const mongoURI = process.env.MONGO_URI;
connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("Error connecting to MongoDB:", err));

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
  paymentStatus: { type: String, default: "Pending" },
});

const Booking = model('Booking', bookingSchema);

// Define Payment model
const paymentSchema = new Schema({
  bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true },
  amount: { type: Number, required: true },
  yocoSessionId: { type: String, required: true },
  paymentStatus: { type: String, enum: ["pending", "successful", "failed"], default: "pending" },
  createdAt: { type: Date, default: Date.now },
});

const Payment = model("Payment", paymentSchema);

// Generate available time slots
function generateAvailableSlots(date) {
  const workingHoursStart = moment(date).set('hour', 8).set('minute', 0);
  const workingHoursEnd = moment(date).set('hour', 19).set('minute', 0); // Changed from 18 to 19

  const slots = [];
  let currentSlot = workingHoursStart;

  while (currentSlot.isBefore(workingHoursEnd)) {
    slots.push(currentSlot.format('HH:mm'));
    currentSlot = currentSlot.add(30, 'minutes');
  }

  return slots;
}


// Fetch available slots
app.get('/api/available-slots', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).send('Date is required');

  const availableSlots = generateAvailableSlots(date);
  const bookedTimes = await Booking.find({ date }).select('time').lean();
  const bookedTimeSlots = bookedTimes.map(booking => booking.time);
  const availableTimes = availableSlots.filter(slot => !bookedTimeSlots.includes(slot));

  return res.json(availableTimes);
});

// Book a car wash and initiate payment (NO email sending here)
app.post("/api/book", async (req, res) => {
  try {
    const {
      firstName, lastName, carModel, washType, additionalServices,
      date, time, email, subscription, serviceLocation, address, totalPrice,
    } = req.body;

    if (!totalPrice || isNaN(Number(totalPrice)) || Number(totalPrice) <= 0) {
      return res.status(400).json({ error: "Invalid total price" });
    }

    const amount = Math.round(Number(totalPrice) * 100);

    const newBooking = new Booking({
      firstName, lastName, carModel, washType, additionalServices,
      date, time, email, subscription, serviceLocation, address,
      paymentStatus: "Pending",
    });

    const savedBooking = await newBooking.save();

    const yocoPayload = {
      amount,
      currency: "ZAR",
      reference: `Booking_${savedBooking._id}`,
      successUrl: `https://kiings.vercel.app/#/success?bookingId=${savedBooking._id}`,
      cancelUrl: `https://kiings.vercel.app/#/paymentcanceled?bookingId=${savedBooking._id}`,
    };

    const yocoResponse = await axios.post(
      "https://payments.yoco.com/api/checkouts",
      yocoPayload,
      {
        headers: {
          Authorization: `Bearer ${process.env.YOCO_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (yocoResponse.data.redirectUrl) {
      await new Payment({
        bookingId: savedBooking._id,
        amount: totalPrice,
        yocoSessionId: yocoResponse.data.id,
        paymentStatus: "pending",
      }).save();

      return res.json({ redirectUrl: yocoResponse.data.redirectUrl });
    }

    return res.status(500).json({ error: "Failed to retrieve Yoco checkout URL" });
  } catch (error) {
    console.error("Booking/payment initiation failed:", error);
    res.status(500).json({ error: "Payment initiation failed" });
  }
});

// Payment confirmation webhook — ONLY here emails are sent
app.post("/api/payments/confirm", async (req, res) => {
  try {
    const { sessionId, status } = req.body;
    if (!sessionId || !status) return res.status(400).json({ error: "Invalid request data" });

    const payment = await Payment.findOne({ yocoSessionId: sessionId });
    if (!payment) return res.status(404).json({ error: "Payment not found" });

    payment.paymentStatus = status === "successful" ? "successful" : "failed";
    await payment.save();

    if (status === "successful") {
      const updatedBooking = await Booking.findByIdAndUpdate(
        payment.bookingId,
        { paymentStatus: "Paid" },
        { new: true }
      );

      if (updatedBooking) {
        await sendBookingEmails({
          firstName: updatedBooking.firstName,
          lastName: updatedBooking.lastName,
          email: updatedBooking.email,
          carModel: updatedBooking.carModel,
          washType: updatedBooking.washType.name,
          date: updatedBooking.date,
          time: updatedBooking.time,
          totalPrice: payment.amount / 100, // convert cents to Rands
        });
      }
    }

    res.json({ message: "Payment status updated successfully" });
  } catch (error) {
    console.error("Payment confirmation failed:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post('/api/bookings/send-confirmation', async (req, res) => {
  const { bookingId } = req.body;
  if (!bookingId) return res.status(400).json({ error: "Booking ID is required" });

  try {
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    await sendBookingEmails({
      firstName: booking.firstName,
      lastName: booking.lastName,
      email: booking.email,
      carModel: booking.carModel,
      washType: booking.washType.name,
      date: booking.date,
      time: booking.time,
      totalPrice: null,
    });

    res.json({ message: "Confirmation email sent" });
  } catch (error) {
    console.error("Failed to send confirmation email:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// Fetch bookings
app.get("/api/my-bookings", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Email is required" });
  res.json(await Booking.find({ email }));
});

app.get("/api/all-bookings", async (req, res) => {
  res.json(await Booking.find());
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${port}`);
});
