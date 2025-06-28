import 'dotenv/config';
import nodemailer from 'nodemailer';

async function sendTestEmail() {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER, 
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: `"Kiings Carwash" <${process.env.EMAIL_USER}>`,
    to: process.env.TEST_EMAIL_TO || process.env.EMAIL_USER,
    subject: 'Kiings Carwash - Test Email',
    text: 'Hello! This is a test email to confirm your Gmail SMTP setup is working.',
    html: '<p>Hello! This is a <b>test email</b> to confirm your Gmail SMTP setup is working.</p>',
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Test email sent:', info.messageId);
  } catch (error) {
    console.error('❌ Error sending test email:', error);
  }
}

sendTestEmail();
