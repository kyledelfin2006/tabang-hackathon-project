// Firebase imports: auth instance, email registration helper, and Firestore doc writer
import { auth, db } from "./firebase.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Displays a toast notification styled as success or error, then fades it out after 3 seconds
function showToast(msg, success) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast' + (success ? ' success' : ' error');
    t.style.opacity = '1';
    setTimeout(function() { t.style.opacity = '0'; }, 3000);
}

// Handles sign-up: validates all fields, creates a Firebase Auth account,
// writes the user profile to Firestore, then redirects to the login page
document.getElementById('signupBtn').onclick = async function() {
    var firstName = document.getElementById('firstNameInput').value.trim();
    var lastName  = document.getElementById('lastNameInput').value.trim();
    var username  = document.getElementById('usernameInput').value.trim();
    var email     = document.getElementById('emailInput').value.trim();
    var pass      = document.getElementById('passInput').value.trim();

    // Client-side validation — check for empty fields, valid email format, and minimum password length
    if (!firstName)           { showToast('⚠️ Please enter your first name'); return; }
    if (!lastName)            { showToast('⚠️ Please enter your last name'); return; }
    if (!username)            { showToast('⚠️ Please enter a username'); return; }
    if (!email)               { showToast('⚠️ Please enter your email'); return; }
    if (!email.includes('@')) { showToast('⚠️ Please enter a valid email'); return; }
    if (!pass)                { showToast('⚠️ Please enter a password'); return; }
    if (pass.length < 6)      { showToast('⚠️ Password must be at least 6 characters'); return; }

    try {
        // Create the Firebase Auth account — throws if email is already in use or password is too weak
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;

        // Write the user's profile to the 'users' collection, keyed by their Firebase UID
        await setDoc(doc(db, "users", user.uid), {
            firstName: firstName,
            lastName: lastName,
            fullName: firstName + ' ' + lastName,  // Pre-computed for easier display elsewhere
            username: username,
            email: email,
            createdAt: new Date()
        });

        showToast('✅ Account created!', true);
        // Short delay so the user can read the success toast before being redirected
        setTimeout(function() { window.location.href = 'Login.html'; }, 1500);
    } catch (err) {
        // Covers Firebase Auth errors (duplicate email, weak password) and Firestore write failures
        showToast('⚠️ ' + err.message);
    }
};