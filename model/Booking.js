const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  carModel: { type: String, required: true },
  email: { type: String, required: true },
  washType: {
    name: { type: String, required: false },
    price: { type: Number, required: false },
    details: { type: String, required: false },
  },
  additionalServices: [{
    name: { type: String, required: false },
    price: { type: Number, required: false },
  }],
  date: { type: Date, required: false },
  time: { type: String, required: false },
  serviceLocation: { type: String, required: false },
  address: { type: String, required: false },
  subscription: { type: Boolean, default: false }, // Add default false
  totalPrice: { type: Number, required: true }, // Always required
  createdAt: { type: Date, default: Date.now },
  paymentStatus: { type: String, default: "Pending" },
});

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;
