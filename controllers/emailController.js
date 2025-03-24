const nodemailer = require("nodemailer");
require("dotenv").config();

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Send booking emails
const sendBookingEmails = async (bookingData) => {
  const { firstName, lastName, email, carModel, washType, date, time, totalPrice } = bookingData;

  // Owner's email content
  const ownerMailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER, // Owner receives this
    subject: "New Car Wash Booking",
    html: `
      <h2>New Booking Received</h2>
      <p><strong>Name:</strong> ${firstName} ${lastName}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Car Model:</strong> ${carModel}</p>
      <p><strong>Wash Type:</strong> ${washType}</p>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Time:</strong> ${time}</p>
      <p><strong>Total Price:</strong> R${totalPrice}</p>
    `,
  };

  // User's confirmation email content
  const userMailOptions = {
    from: process.env.EMAIL_USER,
    to: email, // Send to user
    subject: "Booking Confirmation - Kiings Car Wash",
    html: `
      <h2>Booking Confirmed</h2>
      <p>Dear ${firstName},</p>
      <p>Your car wash appointment has been confirmed.</p>
      <p><strong>Car Model:</strong> ${carModel}</p>
      <p><strong>Wash Type:</strong> ${washType}</p>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Time:</strong> ${time}</p>
      <p><strong>Total Price:</strong> R${totalPrice}</p>
      <p>Thank you for choosing Kiings Car Wash!</p>
    `,
  };

  // Send both emails
  try {
    await transporter.sendMail(ownerMailOptions);
    await transporter.sendMail(userMailOptions);
    console.log("Emails sent successfully!");
  } catch (error) {
    console.error("Error sending emails:", error);
  }
};

module.exports = { sendBookingEmails };
