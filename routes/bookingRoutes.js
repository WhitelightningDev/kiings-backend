const express = require('express');
const {
  getAvailableSlots,
  createBooking,
  cancelBooking, // 👈 Import new controller
} = require('../controllers/bookingController');

const router = express.Router();

router.get('/available-slots', getAvailableSlots);
router.post('/bookings', createBooking);

// ✅ Add this route to handle DELETE
router.delete('/cancel-booking/:id', cancelBooking);

module.exports = router;
