const Booking = require('../models/Booking');

// Helper to generate all 30-min slots from 08:00 to 18:00
function generateSlotsForDay(date) {
  const slots = [];
  for (let hour = 8; hour < 18; hour++) {
    slots.push(`${hour.toString().padStart(2, '0')}:00`);
    slots.push(`${hour.toString().padStart(2, '0')}:30`);
  }
  return slots;
}

// Get available slots for a specific date
async function getAvailableSlots(req, res) {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ message: 'Date query parameter is required' });
  }

  try {
    const bookings = await Booking.find({ date }).select('time').lean();
    const allSlots = generateSlotsForDay(date);
    const bookedSlots = bookings.map(b => b.time);

    const availableSlots = allSlots.filter(slot => {
      // Prevent booking within 1 hour of an existing booking
      return !bookedSlots.some(bookedSlot => {
        const slotTime = new Date(`1970-01-01T${slot}:00Z`);
        const bookedTime = new Date(`1970-01-01T${bookedSlot}:00Z`);
        const diffHours = Math.abs(slotTime - bookedTime) / 36e5; // ms to hours
        return diffHours < 1;
      });
    });

    res.status(200).json(availableSlots);
  } catch (error) {
    console.error('Error fetching available slots:', error);
    res.status(500).json({ message: 'Error fetching available slots' });
  }
}

// Create a new booking
async function createBooking(req, res) {
  const { firstName, lastName, email, carModel, totalPrice } = req.body;

  if (!firstName || !lastName || !email || !carModel || !totalPrice) {
    return res.status(400).json({ message: 'Missing required booking fields.' });
  }

  try {
    const newBooking = new Booking(req.body);
    await newBooking.save();
    res.status(201).json(newBooking);
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ message: 'Error creating booking' });
  }
}

// Cancel booking by ID
async function cancelBooking(req, res) {
  const { id } = req.params;

  try {
    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    await Booking.findByIdAndDelete(id);
    res.status(200).json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ message: 'Error cancelling booking' });
  }
}

module.exports = {
  getAvailableSlots,
  createBooking,
  cancelBooking,
};
