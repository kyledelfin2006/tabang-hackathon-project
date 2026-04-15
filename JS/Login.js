// Kyle was here...Hello kyle! and Hello to you reader!
// Firebase imports: database, auth instance, Firestore doc helpers, and auth state/sign-out
import { auth } from "../javascript/firebase.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Quick helper to pop a temporary message at the bottom of the screen.
// It fades out on its own after 3 seconds so we don't need a close button.
function showToast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.style.opacity = '1';
    setTimeout(function() { t.style.opacity = '0'; }, 3000);
}

// Handle login. We do a bit of client-side validation first just to catch
// obvious mistakes before even hitting Firebase -- saves an unnecessary round trip.
document.getElementById('loginBtn').onclick = async function() {
    var emailOrUser = document.getElementById('emailInput').value.trim();
    var pass        = document.getElementById('passInput').value.trim();

    // Don't let the user submit an empty email/username field
    if (!emailOrUser) { showToast('Please enter your email or username'); return; }

    // Only validate email format if the input looks like an email.
    // If it has no @, we treat it as a username and let Firebase sort it out.
    if (emailOrUser.includes('@') && !emailOrUser.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        showToast('Please enter a valid email'); return;
    }

    if (!pass) { showToast('Please enter your password'); return; }

    // Firebase itself enforces 6 chars, but catching it here gives a friendlier message
    if (pass.length < 6) { showToast('Password must be at least 6 characters'); return; }

    try {
        await signInWithEmailAndPassword(auth, emailOrUser, pass);
        // On success, send the user straight to the main page
        window.location.href = 'Homepage.html';
    } catch (err) {
        // Firebase error messages are fairly readable, so we just pass them through
        showToast(err.message);
    }
};

// Guest mode skips authentication entirely -- user just lands on the homepage
// without an account. Useful for letting people browse before committing to signing up.
document.getElementById('guestBtn').onclick = function() {
    window.location.href = 'Homepage.html';
};