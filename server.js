import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import moment from 'moment';
import axios from 'axios';
import { connect, Schema, model } from 'mongoose';
import { config } from 'dotenv';
import { sendBookingEmails } from './controllers/emailController.js';

config();

const app = express();
const port = process.env.PORT || 3030;

// CORS Configuration
const allowedOrigins = ["https://kiings.vercel.app", "http://localhost:3000"];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: "Content-Type,Authorization",
    credentials: true,
  })
);

app.use(bodyParser.json());

// Connect to MongoDB
const mongoURI = process.env.MONGO_URI;
connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Schemas and Models
const bookingSchema = new Schema({
  firstName: String,
  lastName: String,
  carModel: String,
  washType: {
    name: String,
    price: Number,
    details: String,
  },
  additionalServices: [{ name: String, price: Number }],
  date: String,
  time: String,
  email: String,
  subscription: String,
  serviceLocation: String,
  address: String,
  paymentStatus: { type: String, default: "Pending" },
});

const Booking = model('Booking', bookingSchema);

const paymentSchema = new Schema({
  bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true },
  amount: { type: Number, required: true },
  yocoSessionId: { type: String, required: true },
  paymentStatus: {
    type: String,
    enum: ["pending", "successful", "failed"],
    default: "pending",
  },
  createdAt: { type: Date, default: Date.now },
});

const Payment = model("Payment", paymentSchema);

// Utility: Generate time slots
function generateAvailableSlots(date) {
  const start = moment(date).set('hour', 8).set('minute', 0);
  const end = moment(date).set('hour', 18).set('minute', 0);
  const slots = [];
  let current = start;

  while (current.isBefore(end)) {
    slots.push(current.format('HH:mm'));
    current = current.add(30, 'minutes');
  }

  return slots;
}

// Get Available Time Slots
app.get('/api/available-slots', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).send("Date is required");

  const booked = await Booking.find({ date }).select('time').lean();
  const bookedSlots = booked.map(b => b.time);
  const available = generateAvailableSlots(date).filter(slot => !bookedSlots.includes(slot));

  res.json(available);
});

// Book & Create Yoco Checkout (NO email sent here)
app.post("/api/book", async (req, res) => {
  try {
    const {
      firstName, lastName, carModel, washType, additionalServices,
      date, time, email, subscription, serviceLocation, address, totalPrice,
    } = req.body;

    if (!totalPrice || isNaN(totalPrice) || Number(totalPrice) <= 0) {
      return res.status(400).json({ error: "Invalid total price" });
    }

    const amount = Math.round(Number(totalPrice) * 100); // Convert to cents

    // Step 1: Create temporary Yoco session
    const yocoResponse = await axios.post(
      "https://payments.yoco.com/api/checkouts",
      {
        amount,
        currency: "ZAR",
        reference: `Booking_${Date.now()}`, // Temporary, will update after booking is saved
        successUrl: `https://kiings.vercel.app/#/success`,
        cancelUrl: `https://kiings.vercel.app/#/paymentcanceled`,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.YOCO_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!yocoResponse.data?.redirectUrl || !yocoResponse.data?.id) {
      return res.status(500).json({ error: "Yoco checkout creation failed" });
    }

    const sessionId = yocoResponse.data.id;

    // Step 2: Save booking to DB
    const newBooking = new Booking({
      firstName, lastName, carModel, washType, additionalServices,
      date, time, email, subscription, serviceLocation, address,
      paymentStatus: "Pending",
    });

    const savedBooking = await newBooking.save();

    // Step 3: Update Yoco reference (optional, if editable via their API)
    // Not needed unless Yoco allows PATCH on checkout session (currently not public)

    // Step 4: Save session to Payment DB
    await new Payment({
      bookingId: savedBooking._id,
      amount: totalPrice,
      yocoSessionId: sessionId,
      paymentStatus: "pending",
    }).save();

    // Step 5: Return redirect URL with appended booking and sessionId
    const redirectUrl = `${yocoResponse.data.redirectUrl}&bookingId=${savedBooking._id}&sessionId=${sessionId}`;

    return res.json({ redirectUrl });
  } catch (error) {
    console.error("❌ Booking/payment error:", error?.response?.data || error.message || error);
    res.status(500).json({ error: "Booking or payment initiation failed" });
  }
});

// Confirm Payment & Send Email
app.post("/api/payments/confirm", async (req, res) => {
  try {
    const { sessionId, status } = req.body;
    if (!sessionId || !status) {
      return res.status(400).json({ error: "Missing sessionId or status" });
    }

    const payment = await Payment.findOne({ yocoSessionId: sessionId });
    if (!payment) return res.status(404).json({ error: "Payment not found" });

    payment.paymentStatus = status === "successful" ? "successful" : "failed";
    await payment.save();

    if (status === "successful") {
      const booking = await Booking.findByIdAndUpdate(
        payment.bookingId,
        { paymentStatus: "Paid" },
        { new: true }
      );

      if (booking) {
        await sendBookingEmails({
          firstName: booking.firstName,
          lastName: booking.lastName,
          email: booking.email,
          carModel: booking.carModel,
          washType: booking.washType.name,
          date: booking.date,
          time: booking.time,
          totalPrice: payment.amount / 100, // convert to rands
        });
      }
    }

    return res.json({ message: "Payment status updated" });
  } catch (error) {
    console.error("❌ /api/payments/confirm error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get Bookings by Email
app.get("/api/my-bookings", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Email is required" });

  const bookings = await Booking.find({ email });
  res.json(bookings);
});

// Get All Bookings
app.get("/api/all-bookings", async (_req, res) => {
  const bookings = await Booking.find();
  res.json(bookings);
});

// Start Server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
