// src/services/emailService.js
const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false, // Use STARTTLS
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false // Allow self-signed certificates for development
      }
    });
  }

  async sendEmail({ to, subject, html }) {
    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to,
      subject,
      html
    };

    return this.transporter.sendMail(mailOptions);
  }

  async sendVerificationOtp(email, otp) {
    return this.sendEmail({
      to: email,
      subject: 'SMEGo - Email Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333; text-align: center;">Email Verification</h2>
          <p>Thank you for creating an account with SMEGo. Please use the verification code below to verify your email address:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="background-color: #f8f9fa; border: 2px dashed #007bff; padding: 20px; border-radius: 8px; display: inline-block;">
              <h1 style="color: #007bff; margin: 0; font-size: 32px; letter-spacing: 4px; font-weight: bold;">
                ${otp}
              </h1>
            </div>
          </div>
          
          <p><strong>Important:</strong></p>
          <ul>
            <li>This verification code will expire in <strong>10 minutes</strong></li>
            <li>Enter this code in the verification form to complete your registration</li>
            <li>If you didn't create an account, please ignore this email</li>
          </ul>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 14px; text-align: center;">
            This is an automated message from SMEGo. Please do not reply to this email.
          </p>
        </div>
      `
    });
  }

  async sendVerificationEmail(email, token) {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${token}`;

    return this.sendEmail({
      to: email,
      subject: 'Verify Your Email Address',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Verify Your Email Address</h2>
          <p>Thank you for creating an account. Please click the button below to verify your email address:</p>
          <a href="${verificationUrl}" 
             style="background-color: #4CAF50; color: white; padding: 14px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
            Verify Email
          </a>
          <p>Or copy and paste this link in your browser:</p>
          <p><a href="${verificationUrl}">${verificationUrl}</a></p>
          <p>This link will expire in 24 hours.</p>
          <p>If you didn't create an account, please ignore this email.</p>
        </div>
      `
    });
  }

  async sendInviteEmail(email, inviteData) {
    const { organizationName, inviteLink, role } = inviteData;
    const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1);

    return this.sendEmail({
      to: email,
      subject: `Invitation to join ${organizationName} - SMEGo`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin: 0;">SMEGo</h1>
            <p style="color: #666; margin: 5px 0;">Small & Medium Enterprise Management</p>
          </div>

          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 30px;">
            <h2 style="margin: 0 0 10px 0; font-size: 24px;">You're Invited!</h2>
            <p style="margin: 0; font-size: 16px; opacity: 0.9;">Join ${organizationName} as a ${roleDisplay}</p>
          </div>

          <div style="background: #f8fafc; padding: 25px; border-radius: 8px; margin-bottom: 30px;">
            <h3 style="margin: 0 0 15px 0; color: #1f2937;">What's Next?</h3>
            <div style="display: flex; align-items: center; margin-bottom: 15px;">
              <div style="width: 24px; height: 24px; background: #10b981; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; margin-right: 12px; font-size: 14px; font-weight: bold;">1</div>
              <span style="color: #4b5563;">Click the invitation link below</span>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 15px;">
              <div style="width: 24px; height: 24px; background: #10b981; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; margin-right: 12px; font-size: 14px; font-weight: bold;">2</div>
              <span style="color: #4b5563;">Create your account with your details</span>
            </div>
            <div style="display: flex; align-items: center;">
              <div style="width: 24px; height: 24px; background: #10b981; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; margin-right: 12px; font-size: 14px; font-weight: bold;">3</div>
              <span style="color: #4b5563;">Start collaborating with your team</span>
            </div>
          </div>

          <div style="text-align: center; margin-bottom: 30px;">
            <a href="${inviteLink}" 
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              Join ${organizationName}
            </a>
          </div>

          <div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 8px; margin-bottom: 25px;">
            <p style="margin: 0; color: #92400e;">
              <strong>⚠️ Important:</strong> This invitation link will expire in 7 days. If you need a new invitation, please contact your administrator.
            </p>
          </div>

          <div style="border-top: 1px solid #e5e7eb; padding-top: 20px;">
            <p style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280;">Can't click the button? Copy and paste this link:</p>
            <p style="word-break: break-all; background: #f9fafb; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px; color: #374151;">${inviteLink}</p>
          </div>

          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          
          <div style="text-align: center;">
            <p style="color: #9ca3af; font-size: 14px; margin: 0;">
              This is an automated invitation from SMEGo. If you believe you received this email in error, please ignore it.
            </p>
          </div>
        </div>
      `
    });
  }
}

module.exports = new EmailService();
