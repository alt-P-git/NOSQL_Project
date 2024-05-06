const nodemailer = require("nodemailer");
const sgMail = require('@sendgrid/mail')
const Mailjet = require('node-mailjet');
var SibApiV3Sdk = require('sib-api-v3-sdk');

const sendEmailNodeMailer = async (receiverEmail, fileID, senderName = "Encrypt Share") => {

  console.log("receiverEmail", receiverEmail);

  let config = {
    service: 'gmail',
    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASSWORD
    }
  }

  const transporter = nodemailer.createTransport(config);

  const message = {
    from: process.env.EMAIL,
    to: receiverEmail,
    subject: "Here is your File ID!",
    text: `Dear user, here is your File ID: ${fileID}`,
    html: `
    <h3>Dear user,</h3>
    <br/>
    Download page: <a href='http://secureshare-thedrbs-projects.vercel.app'>download page link</a>
    <br />
    Here is your File ID: <strong>${fileID}</strong>
    <br /><br />
    <b>Because of our security policy we don't share passwords. You need to ask the sender for it.</b>
    `
  }

  transporter.sendMail(message, (err, info) => {
    if (err) {
      console.log("Error occurred when sending email => " + err.message);
      return err;
    }
    console.log("Message sent via email: %s", info.messageId);
    return info;
  }
  );
  console.log("email sent...");
};

module.exports = sendEmailNodeMailer;