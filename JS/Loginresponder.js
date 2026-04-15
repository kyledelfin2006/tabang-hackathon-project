// Firebase imports: auth, database instance, email sign-in helper, and Firestore doc helpers
import { auth, db } from './firebase.js';
import { signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Displays a brief toast notification, then fades it out after 3.5 seconds
function showToast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.style.opacity = '1';
    setTimeout(function() { t.style.opacity = '0'; }, 3500);
}

// Highlights an input field with a red outline and clears it as soon as the user starts typing
function markInvalid(id) {
    const el = document.getElementById(id);
    el.style.boxShadow = '0 0 0 2px #ff3b30';
    el.addEventListener('input', () => el.style.boxShadow = '', { once: true });
}

// Handles the login button click: validates inputs, signs in via Firebase Auth,
// then verifies the user exists in the 'responders' collection before redirecting
document.getElementById('loginBtn').onclick = async function() {
    var emailOrUser = document.getElementById('emailInput').value.trim();
    var pass        = document.getElementById('passInput').value.trim();

    // Client-side validation — check for empty fields and minimum password length
    if (!emailOrUser) { showToast('⚠️ Please enter your email or username'); markInvalid('emailInput'); return; }
    if (!pass)        { showToast('⚠️ Please enter your password');           markInvalid('passInput');  return; }
    if (pass.length < 6) { showToast('⚠️ Password must be at least 6 characters'); markInvalid('passInput'); return; }

    showToast('🔄 Signing in...', true);

    try {
        // Only email addresses are accepted — username lookup would require additional Firestore read rules
        if (!emailOrUser.includes('@')) {
            throw new Error('Please log in using email address');
        }

        const userCredential = await signInWithEmailAndPassword(auth, emailOrUser, pass);
        const uid = userCredential.user.uid;

        // Verify the authenticated user has a record in the 'responders' collection
        // Regular users without a responder document are denied access
        const responderDoc = await getDoc(doc(db, 'responders', uid));
        if (!responderDoc.exists()) {
            throw new Error('Access denied. This login is for responders only.');
        }

        showToast('✅ Login successful! Redirecting...', true);

        // Short delay so the user can read the success toast before navigating
        setTimeout(() => {
            window.location.href = 'responderhomepage.html';
        }, 1000);

    } catch (error) {
        // Covers both Firebase Auth errors (wrong password, user not found) and the responder check above
        console.error('Login failed', error);
        showToast('⚠️ ' + (error.message || 'Login failed.'));
        markInvalid('emailInput');
        markInvalid('passInput');
    }
};