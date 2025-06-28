const express = require('express');
const {
  getAvailableSlots,
  createBooking,
  cancelBooking,
} = require('../controllers/bookingController');

const router = express.Router();

router.get('/available-slots', getAvailableSlots);
router.post('/bookings', createBooking);
router.delete('/cancel-booking/:id', cancelBooking);

module.exports = router;
