import express from 'express';
import cors from 'cors';
import json from 'body-parser';
import moment from 'moment';
import { connect, Schema, model } from 'mongoose';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

const app = express();

// Use the PORT environment variable or fallback to 3000 if not set
const port = process.env.PORT || 3030;

// Middleware
app.use(cors());
  
app.use(json());

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
});

const Booking = model('Booking', bookingSchema);

// Time slot buffer (1 hour)
const bufferTimeInMinutes = 60;

// Helper function to generate available time slots
function generateAvailableSlots(date) {
  const workingHoursStart = moment(date).set('hour', 8).set('minute', 0); // 8:00 AM
  const workingHoursEnd = moment(date).set('hour', 18).set('minute', 0); // 6:00 PM
  const slots = [];
  let currentSlot = workingHoursStart;

  while (currentSlot.isBefore(workingHoursEnd)) {
    slots.push(currentSlot.format('HH:mm'));
    currentSlot = currentSlot.add(30, 'minutes'); // 30-minute slots
  }

  return slots;
}

// Fetch available slots for a given date
app.get('/api/available-slots', async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).send('Date is required');
  }

  // Generate available slots
  const availableSlots = generateAvailableSlots(date);

  // Remove any slots already booked
  const bookedTimes = await Booking.find({ date }).select('time').lean();
  const bookedTimeSlots = bookedTimes.map(booking => booking.time);

  const availableTimes = availableSlots.filter(slot => !bookedTimeSlots.includes(slot));

  return res.json(availableTimes);
});

// Book a car wash
app.post('/api/bookings', async (req, res) => {
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
  } = req.body;

  // Validate input
  if (!firstName || !lastName || !carModel || !washType || !date || !time || !email || !serviceLocation) {
    return res.status(400).send('All fields are required');
  }

  // Check if the selected time slot is available
  const selectedTime = moment(`${date} ${time}`, 'YYYY-MM-DD HH:mm');
  const bufferStartTime = selectedTime.subtract(bufferTimeInMinutes, 'minutes');
  const bufferEndTime = selectedTime.add(bufferTimeInMinutes, 'minutes');

  // Check if any booking overlaps with the buffer time
  const isOverlapping = await Booking.find({
    date,
    time: { $gte: bufferStartTime.format('HH:mm'), $lte: bufferEndTime.format('HH:mm') },
  }).lean();

  if (isOverlapping.length > 0) {
    return res.status(400).send('Selected time slot is not available due to overlap');
  }

  // Create a new booking
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
  });

  try {
    await newBooking.save();
    res.status(201).json({ message: 'Booking confirmed', booking: newBooking });
  } catch (error) {
    res.status(500).send('There was an error with your booking.');
  }
});

// Start the server and bind to all interfaces
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${port}`);
});
