// Firebase imports: auth instance, email registration helper, and Firestore doc writer
import { auth, db } from "../javascript/firebase.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Displays a toast notification styled as success or error, then fades it out after 3 seconds
function showToast(msg, success) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast' + (success ? ' success' : ' error');
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

function friendlySignupError(error) {
    const code = error && error.code;
    if (code === 'auth/email-already-in-use') {
        return 'This email is already registered. Log in instead or use another email.';
    }
    if (code === 'auth/invalid-email') {
        return 'Please enter a valid email address, like name@example.com.';
    }
    if (code === 'auth/weak-password') {
        return 'Password is too weak. Use at least 6 characters.';
    }
    if (code === 'auth/network-request-failed') {
        return 'Network problem. Please check your connection and try again.';
    }
    return 'Could not create the account. Please review the fields and try again.';
}

// Handles sign-up: validates all fields, creates a Firebase Auth account,
// writes the user profile to Firestore, then redirects to the login page
document.getElementById('signupBtn').onclick = async function() {
    const signupBtn = document.getElementById('signupBtn');
    var firstName = document.getElementById('firstNameInput').value.trim();
    var lastName  = document.getElementById('lastNameInput').value.trim();
    var username  = document.getElementById('usernameInput').value.trim();
    var email     = document.getElementById('emailInput').value.trim();
    var pass      = document.getElementById('passInput').value.trim();

    // Client-side validation — check for empty fields, valid email format, and minimum password length
    if (!firstName)           { showToast('Please enter your first name.'); markInvalid('firstNameInput'); return; }
    if (!lastName)            { showToast('Please enter your last name.'); markInvalid('lastNameInput'); return; }
    if (!username)            { showToast('Please enter a username.'); markInvalid('usernameInput'); return; }
    if (username.length < 3)   { showToast('Username must be at least 3 characters.'); markInvalid('usernameInput'); return; }
    if (!email)               { showToast('Please enter your email.'); markInvalid('emailInput'); return; }
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) { showToast('Please enter a valid email address, like name@example.com.'); markInvalid('emailInput'); return; }
    if (!pass)                { showToast('Please enter a password.'); markInvalid('passInput'); return; }
    if (pass.length < 6)      { showToast('Password must be at least 6 characters.'); markInvalid('passInput'); return; }

    try {
        signupBtn.disabled = true;
        signupBtn.textContent = 'Creating...';
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

        showToast('Account created. Redirecting to login...', true);
        // Short delay so the user can read the success toast before being redirected
        setTimeout(function() { window.location.href = 'Login.html'; }, 1500);
    } catch (err) {
        // Covers Firebase Auth errors (duplicate email, weak password) and Firestore write failures
        showToast(friendlySignupError(err));
        if (err.code === 'auth/email-already-in-use' || err.code === 'auth/invalid-email') markInvalid('emailInput');
        if (err.code === 'auth/weak-password') markInvalid('passInput');
    } finally {
        signupBtn.disabled = false;
        signupBtn.textContent = 'Create Account';
    }
};
