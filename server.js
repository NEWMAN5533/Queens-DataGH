
// OLD SERVER 2/12/2025//
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

dotenv.config();



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "frontend")));

// 🚨 Prevent duplicate orders (Memory Cache)
const processedOrders = new Map();

/*
  Structure:
  processedOrders.set(paymentReference, {
      status: "success" | "failed",
      response: {...}   // SwiftData response
  });
*/

// Helper: common logic for buy-data (POST or GET)
async function handleBuyDataRequest({network, recipient, pkg, size, paymentReference }) {
  if (!network || !recipient || !pkg || !paymentReference) {
    return { ok: false, status: 400, body: { success: false, message: "Missing required fields" } };
  }

  // 🚨 1. STOP DUPLICATE REQUESTS HERE
  if (processedOrders.has(paymentReference)) {
    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        message: "Order already processed (duplicate prevented)",
        order: processedOrders.get(paymentReference).response
      }
    };
  }

  // 2. Verify Paystack payment
  try {
    const verify = await axios.get(
      `https://api.paystack.co/transaction/verify/${paymentReference}`,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
        timeout: 10000,
      }
    );

    if (!verify.data?.data || verify.data.data.status !== "success") {
      return {
        ok: false,
        status: 400,
        body: { success: false, message: "Payment not verified by Paystack" }
      };
    }

    // 3. Build SwiftData order payload
    const orderData = {
      type: "single",
      volume: parseInt(size, 10),
      phone: recipient,
      offerSlug: pkg,
      webhookUrl:
        process.env.SWIFT_WEBHOOK_URL || "https://swiftdata-link.com/api/webhooks/orders",
    };

    // 4. Post to SwiftData
    const swiftBase = (process.env.SWIFT_BASE_URL || "https://swiftdata-link.com").replace(/\/$/, "");
    const swiftUrl = `${swiftBase}/order/${network}`;

    const swiftRes = await axios.post(swiftUrl, orderData, {
      headers: {
        "x-api-key": process.env.SWIFT_API_KEY,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

    // ❇ SAVE RESULT TO PREVENT DUPLICATES
    processedOrders.set(paymentReference, {
      status: "success",
      response: swiftRes.data,
    });

    if (swiftRes.data?.success) {
      return {
        ok: true,
        status: 200,
        body: {
          success: true,
          message: "Bundle order placed",
          order: swiftRes.data,
        },
      };
    } else {
      return {
        ok: false,
        status: 400,
        body: {
          success: false,
          message: "SwiftData request failed",
          details: swiftRes.data,
        },
      };
    }
  } catch (err) {
    const errData = err.response?.data || err.message || err;
    console.error("🔥 handleBuyDataRequest error:", errData);

    // Save failure so duplicate network retry does not call Swift again
    processedOrders.set(paymentReference, {
      status: "failed",
      response: errData,
    });

    return {
      ok: false,
      status: 500,
      body: {
        success: false,
        message: "Failed to process data order",
        error: errData,
      },
    };
  }
}

// POST route
app.post("/api/buy-data", async (req, res) => {
  const { network, recipient, package: pkg, size, paymentReference } = req.body;
  const result = await handleBuyDataRequest({ network, recipient, pkg, size, paymentReference });
  return res.status(result.status).json(result.body);
});

// GET route
app.get("/api/buy-data", async (req, res) => {
  const { network, recipient, package: pkg, size, paymentReference } = req.query;
  const result = await handleBuyDataRequest({ network, recipient, pkg, size, paymentReference });
  return res.status(result.status).json(result.body);
});

// Status route
app.get("/api/v1/order/status/:orderIdOrRef", async (req, res) => {
  const { orderIdOrRef } = req.params;

  if (!orderIdOrRef) {
    return res.status(400).json({ success: false, message: "Missing order ID or reference" });
  }

  try {
    const base = (process.env.SWIFT_BASE_URL || "https://swiftdata-link.com").replace(/\/$/, "");
    const swiftUrl = `${base}/order/status/${encodeURIComponent(orderIdOrRef)}`;

    const response = await axios.get(swiftUrl, {
      headers: {
        "x-api-key": process.env.SWIFT_API_KEY,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    if (response.data?.success) {
      return res.json({ success: true, order: response.data.order });
    } else {
      return res.status(400).json({
        success: false,
        message: response.data?.message || "Failed to fetch order status",
        details: response.data,
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching order status",
      error: error.response?.data || error.message,
    });
  }
});

// Frontend fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

// ENDS//