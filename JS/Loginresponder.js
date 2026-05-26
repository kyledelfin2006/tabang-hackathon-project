// Firebase imports: auth, database instance, email sign-in helper, and Firestore doc helpers
import { auth, db } from '../javascript/firebase.js';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Displays a brief toast notification, then fades it out after 3.5 seconds
function showToast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t.hideTimer);
    t.hideTimer = setTimeout(function() { t.style.opacity = '0'; }, 4000);
}

// Highlights an input field with a red outline and clears it as soon as the user starts typing
function markInvalid(id) {
    const el = document.getElementById(id);
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
        return 'No responder account found with this email.';
    }
    if (code === 'auth/too-many-requests') {
        return 'Too many failed attempts. Please wait a moment or reset your password.';
    }
    if (code === 'auth/network-request-failed') {
        return 'Network problem. Please check your connection and try again.';
    }
    return error.message || 'Login failed. Please check your email and password, then try again.';
}

// Handles the login button click: validates inputs, signs in via Firebase Auth,
// then verifies the user exists in the 'responders' collection before redirecting
document.getElementById('loginBtn').onclick = async function() {
    const loginBtn = document.getElementById('loginBtn');
    var emailOrUser = document.getElementById('emailInput').value.trim();
    var pass        = document.getElementById('passInput').value.trim();

    // Client-side validation — check for empty fields and minimum password length
    if (!emailOrUser) { showToast('Please enter your responder email address.'); markInvalid('emailInput'); return; }
    if (!emailOrUser.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) { showToast('Please enter a valid email address, like name@example.com.'); markInvalid('emailInput'); return; }
    if (!pass)        { showToast('Please enter your password.');           markInvalid('passInput');  return; }
    if (pass.length < 6) { showToast('Password must be at least 6 characters.'); markInvalid('passInput'); return; }

    showToast('Signing in...');

    try {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing in...';

        const userCredential = await signInWithEmailAndPassword(auth, emailOrUser, pass);
        const uid = userCredential.user.uid;

        // Verify the authenticated user has a record in the 'responders' collection
        // Regular users without a responder document are denied access
        const responderDoc = await getDoc(doc(db, 'responders', uid));
        if (!responderDoc.exists()) {
            throw new Error('This account is not registered as a responder. Use the regular login or sign up as a responder.');
        }

        showToast('Login successful. Redirecting...');

        // Short delay so the user can read the success toast before navigating
        setTimeout(() => {
            window.location.href = 'responderhomepage.html';
        }, 1000);

    } catch (error) {
        // Covers both Firebase Auth errors (wrong password, user not found) and the responder check above
        console.error('Login failed', error);
        showToast(friendlyAuthError(error));
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
        showToast('Enter your responder email first, then tap Forget Password.');
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
    } catch (error) {
        showToast(friendlyAuthError(error));
        markInvalid('emailInput');
    }
};
