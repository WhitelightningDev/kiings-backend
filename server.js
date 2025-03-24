import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import moment from 'moment';
import axios from 'axios';
import { connect, Schema, model } from 'mongoose';
import { config } from 'dotenv';

// Load environment variables
config();

const app = express();
const port = process.env.PORT || 3030;

// Middleware
app.use(
  cors({
    origin: "https://kiings.vercel.app", // ✅ Allow requests only from your frontend domain
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: "Content-Type,Authorization",
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
  const workingHoursEnd = moment(date).set('hour', 18).set('minute', 0);
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

// Book a car wash and initiate payment
app.post("/api/book", async (req, res) => {
  try {
    console.log("📩 Received Booking Data:", req.body); // Log incoming request

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
    } = req.body;

    // Validate totalPrice
    if (!totalPrice || isNaN(Number(totalPrice)) || Number(totalPrice) <= 0) {
      return res.status(400).json({ error: "Invalid total price" });
    }

    // Convert total price to cents for Yoco
    const amount = Math.round(Number(totalPrice) * 100);
    console.log("💰 Amount in Cents for Yoco:", amount); // Debugging log

    // Create a booking record with "Pending" payment status
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
      paymentStatus: "Pending",
    });

    const savedBooking = await newBooking.save();
    console.log("✅ Booking Saved:", savedBooking);

    // Create Yoco payment session
    const yocoPayload = {
      amount, // Correctly converted amount
      currency: "ZAR",
      reference: `Booking_${savedBooking._id}`,
      successUrl: `https://kiings.vercel.app/#/success?bookingId=${savedBooking._id}`,
      cancelUrl: `https://kiings.vercel.app/#/error?bookingId=${savedBooking._id}`,
    };

    console.log("📤 Sending Payment Request to Yoco:", yocoPayload);

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

    console.log("🎉 Yoco Response:", yocoResponse.data);

    // Save payment record
    const newPayment = new Payment({
      bookingId: savedBooking._id,
      amount: totalPrice,
      yocoSessionId: yocoResponse.data.id,
      paymentStatus: "pending",
    });

    await newPayment.save();
    console.log("💳 Payment Record Saved:", newPayment);

    // Ensure the correct `redirectUrl` is sent
    if (yocoResponse.data.checkoutUrl) {
      return res.json({ redirectUrl: yocoResponse.data.checkoutUrl });
    } else {
      return res.status(500).json({ error: "Failed to retrieve Yoco checkout URL" });
    }
  } catch (error) {
    console.error("❌ Yoco Payment Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Payment initiation failed" });
  }
});

// Yoco Payment Confirmation Webhook
app.post("/api/payments/confirm", async (req, res) => {
  try {
    const { sessionId, status } = req.body;

    if (!sessionId || !status) {
      return res.status(400).json({ error: "Invalid request data" });
    }

    const payment = await Payment.findOne({ yocoSessionId: sessionId });

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // Update payment status
    payment.paymentStatus = status === "successful" ? "successful" : "failed";
    await payment.save();

    // If payment is successful, update the corresponding booking
    if (status === "successful") {
      await Booking.findByIdAndUpdate(payment.bookingId, { paymentStatus: "Paid" });
    }

    res.json({ message: "Payment status updated successfully" });
  } catch (error) {
    console.error("Error confirming payment:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Fetch a user's bookings
app.get("/api/my-bookings", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const bookings = await Booking.find({ email });
    res.json(bookings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not retrieve bookings" });
  }
});

// Fetch all bookings for admin
app.get("/api/all-bookings", async (req, res) => {
  try {
    const bookings = await Booking.find();
    res.json(bookings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not retrieve bookings" });
  }
});

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${port}`);
});
