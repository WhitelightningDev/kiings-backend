const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  carModel: String,
  email: String,
  washType: {
    name: String,
    price: Number,
    details: String,
  },
  additionalServices: [{
    name: String,
    price: Number,
  }],
  date: Date,
  time: String, // Store the selected time (e.g., '10:00 AM')
  serviceLocation: String,
  address: String,
  subscription: Boolean,
  createdAt: { type: Date, default: Date.now },
});

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;
