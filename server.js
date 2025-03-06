import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import moment from 'moment';
import { connect, Schema, model } from 'mongoose';
import { config } from 'dotenv';

// Load environment variables
config();

const app = express();
const port = process.env.PORT || 3030;

// Middleware
app.use(cors());
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

// Book a car wash
app.post('/api/bookings', async (req, res) => {
  const { firstName, lastName, carModel, washType, additionalServices, date, time, email, subscription, serviceLocation, address } = req.body;

  if (!firstName || !lastName || !carModel || !washType || !date || !time || !email || !serviceLocation) {
    return res.status(400).send('All fields are required');
  }

  const newBooking = new Booking({
    firstName, lastName, carModel, washType, additionalServices, date, time, email, subscription, serviceLocation, address,
  });

  try {
    await newBooking.save();
    res.status(201).json({ message: 'Booking confirmed', booking: newBooking });
  } catch (error) {
    console.error(error); // Log the error for debugging
    res.status(500).send('There was an error with your booking.');
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
    console.error(error); // Log the error for debugging
    res.status(500).json({ error: "Could not retrieve bookings" });
  }
});

// Fetch all bookings for admin
app.get("/api/all-bookings", async (req, res) => {
  try {
    const bookings = await Booking.find();
    res.json(bookings);
  } catch (error) {
    console.error(error); // Log the error for debugging
    res.status(500).json({ error: "Could not retrieve bookings" });
  }
});

// Cancel a booking
app.delete("/api/cancel-booking/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await Booking.findById(id);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const now = moment();
    const bookingTime = moment(`${booking.date} ${booking.time}`, "YYYY-MM-DD HH:mm");

    if (now.isAfter(bookingTime.subtract(1, "hour"))) {
      return res.status(400).json({ error: "Cannot cancel within 1 hour of appointment" });
    }

    await Booking.findByIdAndDelete(id);
    res.json({ message: "Booking cancelled successfully" });
  } catch (error) {
    console.error(error); // Log the error for debugging
    res.status(500).json({ error: "Could not cancel booking" });
  }
});

// Update booking payment status
app.put("/api/update-payment", async (req, res) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) return res.status(400).json({ error: "Booking ID required" });

    await Booking.findByIdAndUpdate(bookingId, { paymentStatus: "Paid" });
    res.json({ message: "Payment updated successfully" });
  } catch (error) {
    console.error(error); // Log the error for debugging
    res.status(500).json({ error: "Could not update payment" });
  }
});

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${port}`);
});
