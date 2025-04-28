const Booking = require('../models/Booking');

// Get available slots for a specific date
async function getAvailableSlots(req, res) {
  const { date } = req.query;

  try {
    // Find all bookings for the specific date
    const bookings = await Booking.find({ date });

    const allSlots = generateSlotsForDay(date); // Helper function to generate all possible slots for the day
    const bookedSlots = bookings.map(booking => booking.time);

    // Filter out the booked slots and add a 1-hour gap
    const availableSlots = allSlots.filter(slot => {
      const slotTime = new Date(`1970-01-01T${slot}:00Z`);
      return !bookedSlots.includes(slot) &&
             !bookedSlots.some(bookedSlot => {
               const bookedTime = new Date(`1970-01-01T${bookedSlot}:00Z`);
               const timeDifference = Math.abs(slotTime - bookedTime) / (1000 * 60 * 60);
               return timeDifference < 1; // 1-hour gap
             });
    });

    res.status(200).json(availableSlots);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching available slots' });
  }
}

async function createBooking(req, res) {
  const bookingData = req.body;

  if (!bookingData.firstName || !bookingData.lastName || !bookingData.email || !bookingData.carModel || !bookingData.totalPrice) {
    return res.status(400).json({ message: 'Missing required booking fields.' });
  }

  try {
    const newBooking = new Booking(bookingData);
    await newBooking.save();
    res.status(201).json(newBooking);
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ message: 'Error creating booking' });
  }
}


module.exports = { getAvailableSlots, createBooking };
