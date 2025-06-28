import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Setup Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // STARTTLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Use App Password
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// HTML template for email body
const generateEmailTemplate = (title, intro, bookingData) => {
  const { firstName, lastName, email, carModel, washType, date, time, totalPrice } = bookingData;

  return `
    <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.5;">
      <h2 style="color: #2c3e50;">${title}</h2>
      <p>${intro}</p>
      <table style="margin-top: 10px;">
        <tr><td><strong>Name:</strong></td><td>${firstName} ${lastName}</td></tr>
        <tr><td><strong>Email:</strong></td><td>${email}</td></tr>
        <tr><td><strong>Car Model:</strong></td><td>${carModel}</td></tr>
        <tr><td><strong>Wash Type:</strong></td><td>${washType}</td></tr>
        <tr><td><strong>Date:</strong></td><td>${date}</td></tr>
        <tr><td><strong>Time:</strong></td><td>${time}</td></tr>
        <tr><td><strong>Total Price:</strong></td><td>R${totalPrice}</td></tr>
      </table>
      <p style="margin-top: 20px; color: #555;">— Kiings Car Wash</p>
    </div>
  `;
};

// Send booking confirmation emails
export const sendBookingEmails = async (bookingData) => {
  const { email } = bookingData;

  // Email to owner
  const ownerMailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: "🚗 New Car Wash Booking Received",
    html: generateEmailTemplate("New Booking Received", "A customer has booked a car wash. Here are the details:", bookingData),
  };

  // Email to customer
  const userMailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "✅ Booking Confirmation - Kiings Car Wash",
    html: generateEmailTemplate("Booking Confirmed", `Dear ${bookingData.firstName}, your car wash appointment has been confirmed.`, bookingData),
  };

  try {
    await transporter.sendMail(ownerMailOptions);
    await transporter.sendMail(userMailOptions);
    console.log("📩 Booking confirmation emails sent successfully.");
  } catch (error) {
    console.error("❌ Failed to send booking emails:", error);
  }
};
