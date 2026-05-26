// Kyle was here...Hello kyle! and Hello to you reader!
// Firebase imports: database, auth instance, Firestore doc helpers, and auth state/sign-out
import { auth } from "../javascript/firebase.js";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Quick helper to pop a temporary message at the bottom of the screen.
// It fades out on its own after 3 seconds so we don't need a close button.
function showToast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t.hideTimer);
    t.hideTimer = setTimeout(function() { t.style.opacity = '0'; }, 4000);
}

function markInvalid(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.boxShadow = '0 0 0 2px #ff3b30';
    el.focus();
    el.addEventListener('input', () => el.style.boxShadow = '', { once: true });
}

function friendlyAuthError(error) {
    const code = error && error.code;
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        return 'Incorrect email or password. Please check both and try again.';
    }
    if (code === 'auth/user-not-found') {
        return 'No account found with this email. Please check the email or sign up first.';
    }
    if (code === 'auth/too-many-requests') {
        return 'Too many failed attempts. Please wait a moment or reset your password.';
    }
    if (code === 'auth/network-request-failed') {
        return 'Network problem. Please check your connection and try again.';
    }
    return 'Login failed. Please check your email and password, then try again.';
}

// Handle login. We do a bit of client-side validation first just to catch
// obvious mistakes before even hitting Firebase -- saves an unnecessary round trip.
document.getElementById('loginBtn').onclick = async function() {
    const loginBtn = document.getElementById('loginBtn');
    var emailOrUser = document.getElementById('emailInput').value.trim();
    var pass        = document.getElementById('passInput').value.trim();

    // Don't let the user submit an empty email field
    if (!emailOrUser) { showToast('Please enter your email address.'); markInvalid('emailInput'); return; }

    if (!emailOrUser.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        showToast('Please enter a valid email address, like name@example.com.'); markInvalid('emailInput'); return;
    }

    if (!pass) { showToast('Please enter your password.'); markInvalid('passInput'); return; }

    // Firebase itself enforces 6 chars, but catching it here gives a friendlier message
    if (pass.length < 6) { showToast('Password must be at least 6 characters.'); markInvalid('passInput'); return; }

    try {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing in...';
        await signInWithEmailAndPassword(auth, emailOrUser, pass);
        // On success, send the user straight to the main page
        window.location.href = 'Homepage.html';
    } catch (err) {
        showToast(friendlyAuthError(err));
        markInvalid('emailInput');
        markInvalid('passInput');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
    }
};

document.getElementById('forgotPassword').onclick = async function() {
    const email = document.getElementById('emailInput').value.trim();
    if (!email) {
        showToast('Enter your email first, then tap Forget Password.');
        markInvalid('emailInput');
        return;
    }
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        showToast('Enter a valid email address so we can send the reset link.');
        markInvalid('emailInput');
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email);
        showToast('Password reset link sent. Please check your email.');
    } catch (err) {
        showToast(friendlyAuthError(err));
        markInvalid('emailInput');
    }
};

// Guest mode skips authentication entirely -- user just lands on the homepage
// without an account. Useful for letting people browse before committing to signing up.
document.getElementById('guestBtn').onclick = function() {
    window.location.href = 'Homepage.html';
};
