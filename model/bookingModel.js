const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  carModel: String,
  washType: String,
  date: String,
  time: String,
  totalPrice: Number,
  paymentStatus: { type: String, default: "Pending" },
});

module.exports = mongoose.model("Booking", bookingSchema);
