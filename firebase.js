import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAam1-eH1034Avd_7NBfJ4CSXwddq2ZBZk",
  authDomain: "tabang-test.firebaseapp.com",
  projectId: "tabang-test",
  storageBucket: "tabang-test.firebasestorage.app",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);