const express = require('express');
const { getAvailableSlots, createBooking } = require('../controllers/bookingController');
const router = express.Router();

// Route to fetch available slots for a specific date
router.get('/available-slots', getAvailableSlots);

// Route to create a booking
router.post('/bookings', createBooking);

module.exports = router;
