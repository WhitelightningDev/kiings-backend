const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  name: String,
  price: Number,
  details: String,
});

const additionalServiceSchema = new mongoose.Schema({
  name: String,
  price: Number,
});

const bookingSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  carModel: { type: String, required: true },
  email: { type: String, required: true },
  washType: serviceSchema,
  additionalServices: [additionalServiceSchema],
  date: { type: Date },
  time: { type: String },
  serviceLocation: { type: String },
  address: { type: String },
  subscription: { type: Boolean, default: false },
  totalPrice: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  paymentStatus: { type: String, default: 'Pending' },
});

module.exports = mongoose.model('Booking', bookingSchema);
