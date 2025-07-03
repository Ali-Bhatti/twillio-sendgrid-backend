require("dotenv").config();
const TwilioSendGrid = require("../services/TwilioSendGrid.js");

// Send a test email
(async () => {
  try {
    const response = await TwilioSendGrid.sendSimpleEmail({
      to: "recipient@example.com",
      from: "verified_sender@example.com",
      templateKey: "new-order-email",
      dynamicTemplateData: {
        order_id: "12345",
        user_name: "Ali Bhatti",
        items: [{ item_name: "Laptop", price: "$1000" }]
      }
    });

    console.log("✅ Email sent:", response);
  } catch (err) {
    console.error("❌ Failed:", err.message);
  }
})();
