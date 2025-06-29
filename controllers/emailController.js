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

// HTML template for email body with improved styling
const generateEmailTemplate = (title, intro, bookingData) => {
  const { firstName, lastName, email, carModel, washType, date, time, totalPrice } = bookingData;

  return `
  <div style="
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background-color: #f9fafb;
    padding: 30px;
    color: #333;
  ">
    <div style="
      max-width: 600px;
      margin: auto;
      background-color: #ffffff;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      overflow: hidden;
      border: 1px solid #e0e0e0;
    ">
      <header style="background-color: #0078d7; padding: 20px; color: white; text-align: center;">
        <h1 style="margin: 0; font-weight: 600; font-size: 24px;">${title}</h1>
      </header>

      <main style="padding: 25px 30px; font-size: 16px; line-height: 1.6;">
        <p style="margin-bottom: 20px;">${intro}</p>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
          <tbody>
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 10px 0; font-weight: 600; width: 30%;">Name:</td>
              <td style="padding: 10px 0;">${firstName} ${lastName}</td>
            </tr>
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 10px 0; font-weight: 600;">Email:</td>
              <td style="padding: 10px 0;">${email}</td>
            </tr>
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 10px 0; font-weight: 600;">Car Model:</td>
              <td style="padding: 10px 0;">${carModel}</td>
            </tr>
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 10px 0; font-weight: 600;">Wash Type:</td>
              <td style="padding: 10px 0;">${washType}</td>
            </tr>
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 10px 0; font-weight: 600;">Date:</td>
              <td style="padding: 10px 0;">${date}</td>
            </tr>
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 10px 0; font-weight: 600;">Time:</td>
              <td style="padding: 10px 0;">${time}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; font-weight: 600;">Total Price:</td>
              <td style="padding: 10px 0; color: #0078d7; font-weight: 700;">R${totalPrice}</td>
            </tr>
          </tbody>
        </table>

        <p style="font-style: italic; color: #555; margin: 0;">Thank you for choosing Kiings Car Wash.</p>
      </main>

      <footer style="background-color: #f1f1f1; padding: 15px 30px; text-align: center; font-size: 14px; color: #888;">
        &copy; ${new Date().getFullYear()} Kiings Car Wash. All rights reserved.
      </footer>
    </div>
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
    html: generateEmailTemplate(
      "New Booking Received",
      "A customer has booked a car wash. Here are the details:",
      bookingData
    ),
  };

  // Email to customer
  const userMailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "✅ Booking Confirmation - Kiings Car Wash",
    html: generateEmailTemplate(
      "Booking Confirmed",
      `Dear ${bookingData.firstName}, your car wash appointment has been confirmed.`,
      bookingData
    ),
  };

  try {
    await transporter.sendMail(ownerMailOptions);
    await transporter.sendMail(userMailOptions);
    console.log("📩 Booking confirmation emails sent successfully.");
  } catch (error) {
    console.error("❌ Failed to send booking emails:", error);
  }
};
