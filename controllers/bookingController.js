const Booking = require('../models/Booking');

// Helper to generate all time slots in a day (every 30 mins from 08:00 to 18:00)
function generateSlotsForDay(date) {
  const slots = [];
  const startHour = 8;
  const endHour = 19;

  for (let hour = startHour; hour < endHour; hour++) {
    slots.push(`${hour.toString().padStart(2, '0')}:00`);
    slots.push(`${hour.toString().padStart(2, '0')}:30`);
  }

  return slots;
}

// Get available slots for a specific date
async function getAvailableSlots(req, res) {
  const { date } = req.query;

  try {
    const bookings = await Booking.find({ date });
    const allSlots = generateSlotsForDay(date);
    const bookedSlots = bookings.map((booking) => booking.time);

    const availableSlots = allSlots.filter((slot) => {
      const slotTime = new Date(`1970-01-01T${slot}:00Z`);
      return !bookedSlots.includes(slot) &&
        !bookedSlots.some((bookedSlot) => {
          const bookedTime = new Date(`1970-01-01T${bookedSlot}:00Z`);
          const timeDifference = Math.abs(slotTime - bookedTime) / (1000 * 60 * 60);
          return timeDifference < 1; // 1-hour gap
        });
    });

    res.status(200).json(availableSlots);
  } catch (error) {
    console.error('❌ Error fetching available slots:', error);
    res.status(500).json({ message: 'Error fetching available slots' });
  }
}
// Create a new booking
async function createBooking(req, res) {
  const bookingData = req.body;

  if (
    !bookingData.firstName ||
    !bookingData.lastName ||
    !bookingData.email ||
    !bookingData.carModel ||
    !bookingData.totalPrice
  ) {
    return res.status(400).json({ message: 'Missing required booking fields.' });
  }

  try {
    const newBooking = new Booking(bookingData);
    await newBooking.save();
    res.status(201).json(newBooking);
  } catch (error) {
    console.error('❌ Error creating booking:', error);
    res.status(500).json({ message: 'Error creating booking' });
  }
}

// Cancel a booking by ID
async function cancelBooking(req, res) {
  const { id } = req.params;

  try {
    const booking = await Booking.findById(id);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Optional: prevent canceling paid bookings
    // if (booking.paymentStatus === 'Paid') {
    //   return res.status(400).json({ message: 'Cannot cancel a paid booking.' });
    // }

    await Booking.findByIdAndDelete(id);
    res.status(200).json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    console.error('❌ Error cancelling booking:', error);
    res.status(500).json({ message: 'Error cancelling booking' });
  }
}

module.exports = {
  getAvailableSlots,
  createBooking,
  cancelBooking,
};
