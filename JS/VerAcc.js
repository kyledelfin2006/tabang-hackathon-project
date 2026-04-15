// Firebase imports: auth instance, email registration helper, and Firestore doc writer
import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { setDoc, doc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Tracks whether the responder details section is toggled on or off
let responderOn = true;

// Displays a toast notification styled as success or default error, fading out after 3.5 seconds
function showToast(msg, success = false) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast' + (success ? ' success' : '');
    t.style.opacity = '1';
    setTimeout(() => { t.style.opacity = '0'; }, 3500);
}

// Highlights an input with a red outline and clears it as soon as the user starts typing
function markInvalid(id) {
    const el = document.getElementById(id);
    if (el) {
        el.style.boxShadow = '0 0 0 2px #ff3b30';
        el.addEventListener('input', () => el.style.boxShadow = '', { once: true });
    }
}

// Shorthand helpers to read trimmed text input and select values by element ID
function val(id)    { return document.getElementById(id).value.trim(); }
function selVal(id) { return document.getElementById(id).value; }

// Toggles the responder section visibility and updates the toggle button style
window.toggleResponder = function() {
    responderOn = !responderOn;
    const toggle  = document.getElementById('responderToggle');
    const section = document.getElementById('responderSection');
    if (responderOn) {
        toggle.classList.remove('off');
        section.style.display = 'block';
    } else {
        toggle.classList.add('off');
        section.style.display = 'none';
    }
};


// Handles sign-up: validates all fields, conditionally validates responder fields,
// creates a Firebase Auth account, writes the profile to Firestore, then redirects to login
document.getElementById('signupBtn').onclick = async function () {
    const firstName = val('firstNameInput');
    const lastName  = val('lastNameInput');
    const username  = val('usernameInput');
    const email     = val('emailInput');
    const phone     = val('phoneInput');
    const pass      = val('passInput');
    const confirm   = val('confirmInput');

    // Base field validation — checks for empty values, email format, phone format, and password match
    if (!firstName)           { showToast('⚠️ Please enter your first name');         markInvalid('firstNameInput'); return; }
    if (!lastName)            { showToast('⚠️ Please enter your last name');          markInvalid('lastNameInput');  return; }
    if (!username)            { showToast('⚠️ Please enter a username');              markInvalid('usernameInput');  return; }
    if (!email)               { showToast('⚠️ Please enter your email');             markInvalid('emailInput');     return; }
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        showToast('⚠️ Please enter a valid email address');   markInvalid('emailInput');     return; }
    if (!phone)               { showToast('⚠️ Please enter your phone number');      markInvalid('phoneInput');     return; }
    // Allows digits, spaces, and common phone punctuation; enforces 7–15 character length
    if (!/^[\d\s\+\-\(\)]{7,15}$/.test(phone)) {
        showToast('⚠️ Please enter a valid phone number');    markInvalid('phoneInput');     return; }
    if (!pass)                { showToast('⚠️ Please enter a password');             markInvalid('passInput');      return; }
    if (pass.length < 6)      { showToast('⚠️ Password must be at least 6 characters'); markInvalid('passInput'); return; }
    if (!confirm)             { showToast('⚠️ Please confirm your password');        markInvalid('confirmInput');   return; }
    if (pass !== confirm)     { showToast('⚠️ Passwords do not match');              markInvalid('confirmInput');   return; }

    // Responder-specific validation — only runs if the responder section is toggled on
    let responderData = null;
    if (responderOn) {
        const status       = val('responderStatus');
        const org          = val('orgInput');
        const badge        = val('badgeInput');
        const barangay     = val('barangayInput');
        const municipality = selVal('municipalityInput');

        if (!status)       { showToast('⚠️ Please enter your responder status');      markInvalid('responderStatus');    return; }
        if (!org)          { showToast('⚠️ Please enter your organization / agency'); markInvalid('orgInput');           return; }
        if (!badge)        { showToast('⚠️ Please enter your ID / Badge Number');     markInvalid('badgeInput');         return; }
        if (!barangay)     { showToast('⚠️ Please enter your barangay');              markInvalid('barangayInput');      return; }
        // Select elements don't fire 'input', so a 'change' listener is used for the red outline reset
        if (!municipality) { showToast('⚠️ Please select your municipality');
            document.getElementById('municipalityInput').style.boxShadow = '0 0 0 2px #ff3b30';
            document.getElementById('municipalityInput').addEventListener('change', () => {
                document.getElementById('municipalityInput').style.boxShadow = '';
            }, { once: true });
            return;
        }
        // Bundle validated responder fields; province is hardcoded as all responders are in Aklan
        responderData = { status, org, badge, barangay, municipality, province: 'Aklan' };
    }

    showToast('🔄 Creating account...', true);

    try {
        // Firebase Auth enforces email uniqueness; username uniqueness is handled via localStorage elsewhere
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const uid = userCredential.user.uid;

        // Build the full user document — isResponder and responder fields reflect the toggle state
        const userDoc = {
            uid,
            firstName,
            lastName,
            fullName: `${firstName} ${lastName}`,   // Pre-computed for easier display elsewhere
            username,
            email,
            phone,
            isResponder: responderOn,
            responder: responderData,               // null if the responder section was toggled off
            createdAt: new Date().toISOString(),
        };

        // Write to the 'responders' collection, keyed by Firebase UID, as required by security rules
        await setDoc(doc(db, 'responders', uid), userDoc);

        showToast('✅ Account created! Redirecting to login…', true);
        // Short delay so the user can read the success toast before being redirected
        setTimeout(() => { window.location.href = 'Loginresponder.html'; }, 1500);

    } catch (error) {
        // Covers Firebase Auth errors (duplicate email, weak password) and Firestore write failures
        console.error('Sign-up failed', error);
        showToast('⚠️ ' + (error.message || 'Sign-up failed'));
    }
};