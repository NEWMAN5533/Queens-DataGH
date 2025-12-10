// controllers/dataController.js
import axios from "axios";

export const buyDataBundle = async (req, res) => {
  try {
    const { network, recipient, packageName, size, paymentReference } = req.body;

    if (!network || !recipient || !size || !paymentReference) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // ✅ 1. Verify Paystack payment
    const verify = await axios.get(
      `https://api.paystack.co/transaction/verify/${paymentReference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    if (!verify.data.status || verify.data.data.status !== "success") {
      return res.status(400).json({
        success: false,
        message: "Payment not verified",
      });
    }

    console.log(" Paystack verified:", verify.data.data.reference);

    // ✅ 2. Build SwiftData order payload
    const orderData = {
      type: "single",
      volume: parseInt(size),
      phone: recipient,
      offerSlug: packageName,
      webhookUrl: "https://swiftdata-link.com/api/webhooks/orders",
    };

    // ✅ 3. Send order to SwiftData
    const swiftRes = await axios.post(
      `${process.env.SWIFT_BASE_URL}/order/${network}`,
      orderData,
      {
        headers: {
          "x-api-key": process.env.SWIFT_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("SwiftData Response:", swiftRes.data);

    // ✅ 4. Handle success
    if (swiftRes.data.success) {
      return res.json({
        success: true,
        message: " Bundle order placed successfully!",
        order: swiftRes.data,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "SwiftData request failed",
        details: swiftRes.data,
      });
    }
  } catch (error) {
    console.error("⚠ SwiftData Error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to process data order",
      error: error.response?.data || error.message,
});
}
};