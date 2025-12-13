// === firebase-config.js ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCWEv4OxX-nAN_Uo8gsIcGY6qWetjcVfeo",
  authDomain: "queens-b53e4.firebaseapp.com",
  projectId: "queens-b53e4",
  storageBucket: "queens-b53e4.firebasestorage.app",
  messagingSenderId: "212342928088",
  appId: "1:212342928088:web:01512961fe10ac3a0cddad"
};

// ✅ Initialize Firebase app
const app = initializeApp(firebaseConfig);

// ✅ Initialize Firestore
const db = getFirestore(app);

// ✅ Expose to window so main.js can access it
window.FIRESTORE = db;

console.log("🔥 Firebase initialized and Firestore ready!");
export {db};