import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
  auth: {
    user: 'space@ateonlabs.com',
    pass: 'Toyota@Krloskar@2025',
  },
});

transporter.sendMail({
  from: '"ATEON HR" <space@ateonlabs.com>',
  to: 'space@ateonlabs.com',
  subject: 'Test Email',
  text: 'This is a test email.',
})
.then(info => console.log('Success:', info))
.catch(err => console.error('Error:', err));
