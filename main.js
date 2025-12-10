// --- Firebase Imports ---
import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from 
"https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

  // ---------- CONFIG ----------
const API_BASE = (() => {
  // use current host in prod or localhost for local dev
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return "http://localhost:3000";
  }
  return "https://ecodata-app.onrender.com"; // your deployed backend
})();


// ---------- GLOBAL VARIABLES ----------
let STATUS_POLL_INTERVAL = 5000;
let _statusPollTimer = null; // to hold the interval timer ID


// btn events//
document.addEventListener("DOMContentLoaded", () => {

  
document.querySelectorAll(".buy-btn").forEach(button => {
  button.addEventListener("click", () => {
    const packageName = button.dataset.package;
    const network = button.dataset.network;
    const size = button.dataset.size;
    const price = button.dataset.price;

    document.getElementById("priceTag").textContent = `GHS ${button.dataset.price}`;
    document.getElementById("networkTag").textContent = `${button.dataset.network.toUpperCase()} / ${button.dataset.size}GB`;




    // Show phone input modal first
    createPhoneModal(recipient => {


      payWithPaystack(network, recipient, packageName, size, price);
    });
  });
});
});

function createPhoneModal(callback) {

  const modal = document.getElementById("phoneModal");
  const confirmBtn = document.getElementById("confirmBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  const input = document.getElementById("recipientInput");


  // Show modal
  modal.classList.add("show");

  cancelBtn.onclick = () => {
    modal.classList.remove("show");
  };

  confirmBtn.onclick = () => {
    const recipient = input.value.trim();
    if (!recipient) {
      showSnackBar("Please enter your phone number");
      return;
    }
    modal.classList.remove("show");
    callback(recipient);
};
}


// === PAYSTACK PAYMENT (Firebase version) ===
async function payWithPaystack(network, recipient, packageName, size, price) {
  // ✅ Get current user from Firebase Auth
  let user = null;
  try {
    user = firebase.auth().currentUser;
  } catch (err) {
    console.warn("Firebase Auth not initialized:", err);
  }

  // ✅ Collect user details
  const userEmail = user?.email || `${recipient}@ecodata.com`;
  const userName = user?.displayName || "Guest User";
  const userPhone = recipient;

  // ✅ Initialize Paystack
  let handler = PaystackPop.setup({
    key: "pk_live_635856447ee14b583349141b7271f64c9b969749",
    email: userEmail,
    amount: price * 100,
    currency: "GHS",
    metadata: {
      custom_fields: [
        {
          display_name: "Customer Name",
          variable_name: "customer_name",
          value: userName,
        },
        {
          display_name: "Phone Number",
          variable_name: "phone_number",
          value: userPhone,
        },
        {
          display_name: "Network",
          variable_name: "network",
          value: network,
        },
        {
          display_name: "Package",
          variable_name: "package_name",
          value: packageName,
        },
      ],
    },
    callback: function (response) {
      orderBundle(network, recipient, packageName, size, response.reference);
    },
    onClose: function () {
      showSnackBar("Payment cancelled.");
    },
  });

  handler.openIframe();
}


// ---------- FIRESTORE HELPER ----------
async function saveOrderToFirestore(orderObj) {
  try {
    const db = window.FIRESTORE;
    if (!db) {
      console.warn("Firestore not initialized. Make sure firebase-config.js is loaded before main.js");
      return null;
    }

    const { collection, addDoc, serverTimestamp } = await import(
      "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js"
    );

    const docData = {
      orderId: orderObj.orderId || orderObj.reference || null,
      reference: orderObj.reference || null,
      status: (orderObj.status || "pending").toString(),
      recipient: orderObj.recipient || (orderObj.items?.[0]?.recipient) || null,
      volume: Number(orderObj.volume ?? orderObj.items?.[0]?.volume ?? 0),
      amount: Number(orderObj.amount ?? orderObj.totalAmount ?? 0),
      network: orderObj.network || null,
      source: orderObj.source || "web",
      createdAt: serverTimestamp(),
      createdBy:
        window.FIREBASE_AUTH?.currentUser?.uid || "guest"
    };

    const ordersCol = collection(db, "orders");
    const result = await addDoc(ordersCol, docData);
    console.log("✅ Order saved to Firestore:", result.id);
    return result.id;
  } catch (err) {
    console.error("❌ Error saving order to Firestore:", err);
    return null;
}
}

//NEW UPDATED 2/12/2025 //

// === SEND ORDER TO BACKEND ===
async function orderBundle(network, recipient, packageName, size, reference) {
  try {
    const API_BASE =
      window.location.hostname === "localhost"
        ? "http://localhost:3000"
        : "https://ecodata-app.onrender.com";

    // ✅ Build query string for GET request
    const query = new URLSearchParams({
      network,
      recipient,
      package: packageName,
      size: size.toString(),
      paymentReference: reference,
    });

    const response = await fetch(`${API_BASE}/api/buy-data?${query.toString()}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const result = await response.json();

    if (result.success) {
      showSnackBar("✅ Order Placed successfully!");

      // The order object returned from server
      const returnedOrder = result.order?.order || result.order || result;
      console.log("📦 Order details:", returnedOrder);

      // ✅ Save to Firestore
      saveOrderToFirestore(returnedOrder).then((fireId) => {
        if (fireId) console.log("Order persisted in Firestore:", fireId);

        // ✅ Save locally for guests (important fix!)
        saveGuestOrder(returnedOrder);
      });

      // Update dashboard UI or order history
      handleNewOrder(returnedOrder);


    } else {
      showSnackBar(`Failed to purchase data: ${result.message || "Unknown error"}`);
    }
  } catch (err) {
    console.error("⚠ Server error:", err);
    showSnackBar("⚠ Server error. Please try again later.");
  }
}

//ends//




// ✅ Save Guest Orders to Local Storage
function saveGuestOrder(orderData) {
  try {
    const existing = JSON.parse(localStorage.getItem("guestOrders") || "[]");
    existing.push(orderData);
    localStorage.setItem("guestOrders", JSON.stringify(existing));
    console.log("💾 Guest order saved locally:", orderData);
  } catch (e) {
    console.error("Failed to save guest order:", e);
}
}


// POLLING FUNCTION //

// STATUS_POLL_INTERVAL and _statusPollTimer are declared earlier; avoid redeclaration to prevent errors.

 // ---------- HELPERS ----------
function getStatusTextMapping(status) {
  const s = (status || "").toLowerCase();
  return {
    delivered: "Your bundle is successfully delivered.",
    pending: "Order awaiting processing.",
    processing: "Order is processing. Please wait.",
    failed: "Order failed. Contact support or try again.",
    cancelled: "Order was cancelled.",
    refunded: "Payment refunded.",
    resolved: "Issue resolved. Order completed."
  }[s] || "Status update in progress.";
}

function getStatusClass(status) {
  return `status-${(status || "").toLowerCase()}`;
}

function createOrUpdateStatusCard(order) {
  // order expected: { orderId, reference, status, recipient, volume, timestamp }
  const root = document.getElementById("orderStatusContainerRoot");
  if (!root) return;

  const existing = document.getElementById("orderStatusCard");
  const status = (order.status || "pending").toLowerCase();
  const badgeClass = getStatusClass(status);
  const desc = getStatusTextMapping(status);

  const html = `
    <div id="orderStatusCardInner">
      <h4>Order Status</h4>
      <p><strong>Order ID: 
      </strong> ${order.orderId || order.reference || "N/A"}</p>
      <p><strong>Recipient:</strong> ${order.recipient || "-"}</p>
      <p><strong>Volume:</strong> ${order.volume ?? "-"} GB</p>
      <p>
        <strong>Status:</strong>
        <span class="status-badge ${badgeClass}">${status}</span>
      </p>
      <p style="font-size:0.9rem;color:#555;margin-top:6px">${desc}</p>
    </div>
  `;

  if (existing) {
    existing.innerHTML = html;
    existing.classList.remove("hidden");
  } else {
    const card = document.createElement("div");
    card.id = "orderStatusCard";
    card.innerHTML = html;
    root.appendChild(card);
  }
}


// stop polling
function stopStatusPolling() {
  if (_statusPollTimer) {
    clearInterval(_statusPollTimer);
    _statusPollTimer = null;
  }
}

// checks if status is terminal
function isTerminalStatus(status) {
  const s = (status || "").toLowerCase();
  return ["delivered","failed","cancelled","refunded","resolved"].includes(s);
}

// ---------- POLLING FUNCTION ----------
async function checkOrderStatusOnce(orderIdOrRef) {
  try {
    // 🟩 Talk to your own backend now (not directly to SwiftData)
    const res = await fetch(`${API_BASE}/api/v1/order/status/${encodeURIComponent(orderIdOrRef)}`,{
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });


    if (!res.ok) {
      console.warn("Status endpoint returned non-200", res.status);
      return null;
    }
    const data = await res.json();
    if (data && data.success && data.order) return data.order;
    return null;
  } catch (err) {
    console.error("Error checking order status:", err);
    return null;
}
}

function startAutoPolling(orderIdOrRef) {
  // clear existing poll
  stopStatusPolling();

  // initial immediate check
  (async () => {
    const order = await checkOrderStatusOnce(orderIdOrRef);
  if (order) {
  createOrUpdateStatusCard(order); // ✅ Update main color-coded card too
  const status = (order.status || "pending").toLowerCase();
  const desc = getStatusTextMapping(status);
  statusResult.innerHTML = `
    <div style="padding:12px;border-radius:8px;background:#fff">
      <p><strong>Order ID:</strong> ${order.orderId || order.reference}</p>
      <p><strong>Recipient:</strong> ${order.recipient}</p>
      <p><strong>Volume:</strong> ${order.volume} GB</p>
      <p><strong>Status:</strong> <span class="status-badge ${getStatusClass(status)}">${status}</span></p>
      <p style="color:#444;margin-top:6px">${desc}</p>
</div>
`;
}
  })();

  // schedule repeated checks
  _statusPollTimer = setInterval(async () => {
    const order = await checkOrderStatusOnce(orderIdOrRef);
    if (order) {
      createOrUpdateStatusCard(order);
      if (isTerminalStatus(order.status)) {
        stopStatusPolling();
      }
    }
  }, STATUS_POLL_INTERVAL);
}

// ---------- AFTER PURCHASE: show and poll ----------
/**
 * Call this after your backend returns an order reply.
 * Example usage inside orderBundle function after successful response:
 *    const returnedOrder = result.order || result.swift || result; 
 *    handleNewOrder(returnedOrder);
 */
function handleNewOrder(returnedOrder) {
  if (!returnedOrder) return;
  // The Swift response may place order data at top-level or inside order object.
  // Normalize fields:
  const normalized = {
    orderId: returnedOrder.orderId || returnedOrder.orderId || returnedOrder.reference || returnedOrder.reference,
    reference: returnedOrder.reference || returnedOrder.reference,
    status: returnedOrder.status || returnedOrder.status || "pending",
    recipient: returnedOrder.items?.[0]?.recipient || returnedOrder.recipient || "-",
    volume: returnedOrder.items?.[0]?.volume ?? returnedOrder.volume ?? "-"
  };

  // Save last order id/ref to localStorage for later check
  if (normalized.orderId) localStorage.setItem("lastOrderId", normalized.orderId);

  // show card immediately
  createOrUpdateStatusCard(normalized);

  // start polling by orderId or reference (prefer orderId)
  const idToPoll = normalized.orderId || normalized.reference;
  if (idToPoll) startAutoPolling(idToPoll);
}



// ---------- MANUAL CHECK UI binding ----------
document.addEventListener("DOMContentLoaded", () => {
  const last = localStorage.getItem("lastOrderId");
  const orderInput = document.getElementById("orderInput");
  if (orderInput && last) orderInput.value = last;

  const checkBtn = document.getElementById("checkBtn");
  const statusResult = document.getElementById("statusResult");

  if (checkBtn && orderInput && statusResult) {
    checkBtn.addEventListener("click", async () => {
      const id = orderInput.value.trim();
      if (!id) return showSnackBar("Please enter order ID.");

      // Immediate feedback
      statusResult.innerHTML = `
        <div style="padding:10px; border-radius:8px;  display: flex;   background:#f0f0f0; color:#333;">
          <p>🌀 Checking your order status <strong>${id}</strong>...</p>
        </div>
      `;

      try {
        const order = await checkOrderStatusOnce(id);

        if (order) {
          const status = (order.status || "pending").toLowerCase();
          const desc = getStatusTextMapping(status);
          const statusColor = {
            pending: "#e98ea2ff",
            processing: "#f09e23ff",
            completed: "#76d8b2ff",
            failed: "#f44336",
          }[status] || "#4caf50";

          statusResult.innerHTML = `
            <div style="padding:15px; border-radius:10px; background:${statusColor}20; border:2px solid ${statusColor};">
              <h3 style="color:${statusColor}; text-transform:capitalize;">${status}</h3>
              <p><strong>Order ID:</strong> ${order.orderId || order.reference}</p>
              <p><strong>Recipient:</strong> ${order.recipient}</p>
              <p><strong>Volume:</strong> ${order.volume} GB</p>
              <p style="margin-top:8px;">${desc}</p>
            </div>
          `;
        } else {
          statusResult.innerHTML = `
            <div style="padding:10px; background:#ffdddd; border:1px solid #f44336; border-radius:8px;">
              ⚠ Could not find order details for <strong>${id}</strong>.
            </div>
          `;
        }
      } catch (err) {
        console.error("Error checking order status:", err);
        statusResult.innerHTML = `
          <div style="padding:10px; background:#ffdddd; border:1px solid #f44336; border-radius:8px;">
            ❌ Error checking status. Please try again.
          </div>
        `;
      }
});
}
});



// SNACKBAR SECTION //
// ===== SNACKBAR FUNCTION ===== //
function showSnackBar(message, type = "info") {
  // Remove existing snackbar if visible
  const existing = document.querySelector(".snackbar");
  if (existing) existing.remove();

  // Create snackbar element
  const snackbar = document.createElement("div");
  snackbar.className = "snackbar";

  // Color scheme based on type
  if (type === "success") snackbar.style.background = "#7adabaff";   // green
  else if (type === "error") snackbar.style.background = "#dc3545"; // red
  else if (type === "warning") snackbar.style.background = "#ffc107"; // yellow
  else snackbar.style.background = "#beddca"; // default dark

  snackbar.textContent = message;

  // Add snackbar to the body
  document.body.appendChild(snackbar);

  // Force reflow (to trigger CSS animation)
  void snackbar.offsetWidth;

  // Show snackbar
  snackbar.classList.add("show");

  // Hide snackbar after 3 seconds
  setTimeout(() => {
    snackbar.classList.remove("show");
    setTimeout(() => snackbar.remove(), 500);
},5000);
};