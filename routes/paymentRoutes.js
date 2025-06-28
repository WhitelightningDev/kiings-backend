const express = require('express');
const { createPayment, confirmPayment } = require('../controllers/paymentController');

const router = express.Router();

router.post('/pay', createPayment);
router.post('/confirm', confirmPayment);

module.exports = router;
