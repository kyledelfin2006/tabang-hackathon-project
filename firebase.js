import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDLkTrCjXKz6Jldj_BBR62IlRlo0LdxOSs",
  authDomain: "asu-tabang.firebaseapp.com",
  projectId: "asu-tabang",
  storageBucket: "asu-tabang.firebasestorage.app",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);