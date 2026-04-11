// Firebase imports: database, auth instance, Firestore doc helpers, and auth state/sign-out
import { db, auth } from "./javascript/firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged, signOut as firebaseSignOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";


// Opens a modal by adding the 'show' class, then focuses the first focusable element inside it
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('show');
        const focusable = modal.querySelector('button, [tabindex="0"]');
        if (focusable) focusable.focus();
    }
}

// Closes a modal by removing the 'show' class
function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('show');
}

// Expose modal functions globally so they can be called from inline HTML attributes
window.openModal = openModal;
window.closeModal = closeModal;


// Close a modal when clicking directly on the overlay background (not on modal content)
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(overlay.id);
    });
});

// Close a modal when clicking any element with a [data-close] attribute
document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

// Close all open modals when the Escape key is pressed
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.show').forEach(m => closeModal(m.id));
    }
});


// Binds a click and keyboard (Enter/Space) handler to a menu item element by ID
function bindMenuClick(id, action) {
    const el = document.getElementById(id);
    if (!el) return;
    const activate = () => action();
    el.addEventListener('click', activate);
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
}

// Wire up sidebar/menu items to open their respective modals
bindMenuClick('menu-notif',    () => openModal('modal-notif'));
bindMenuClick('menu-help',     () => openModal('modal-help'));
bindMenuClick('menu-settings', () => openModal('modal-settings'));
bindMenuClick('menu-signout',  () => openModal('modal-signout'));


// Navigate back to the previous page, or fall back to the responder homepage if no referrer exists
document.getElementById('backBtn').addEventListener('click', () => {
    if (document.referrer) {
        history.back();
    } else {
        window.location.href = 'responderhomepage.html';
    }
});

// Toggle switches: flip the 'on' class and sync aria-checked for accessibility
document.querySelectorAll('.toggle[role="switch"]').forEach(toggle => {
    const activate = () => {
        const isOn = toggle.classList.toggle('on');
        toggle.setAttribute('aria-checked', isOn.toString());
    };
    toggle.addEventListener('click', activate);
    toggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
});


// Trigger the hidden file input when the avatar wrapper is clicked
document.getElementById('avatarWrapper').addEventListener('click', () => {
    document.getElementById('photo-input').click();
});


// Maps organization names to their corresponding emoji icons for display
const ORG_ICONS = {
    'MDRRMO':               '🚨',
};

// Populates the organization and location fields on the profile page from local user data
function populateExtraFields(localUser) {
    // Display organization with its emoji icon, or a default building icon
    const orgEl = document.getElementById('profileOrg');
    if (orgEl && localUser.responder && localUser.responder.org) {
        const org  = localUser.responder.org;
        const icon = ORG_ICONS[org] || '🏢';
        orgEl.textContent  = icon + ' ' + org;
        orgEl.style.display = '';
    }

    // Build and display the location string from barangay, municipality, and province
    const locEl = document.getElementById('profileLocation');
    if (locEl && localUser.responder) {
        const r = localUser.responder;
        const parts = [];
        if (r.barangay)     parts.push('Brgy. ' + r.barangay);
        if (r.municipality) parts.push(r.municipality);
        if (r.province)     parts.push(r.province);
        if (parts.length) {
            locEl.textContent  = '📍 ' + parts.join(', ');
            locEl.style.display = '';
        }
    }
}

// Generates initials (up to 2 characters) from a full name and displays them in the avatar circle
function setInitialsAvatar(name) {
    const initials = name
        .split(' ')
        .map(w => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || '?';
    document.getElementById('avatar-initials').textContent = initials;
}


// When a photo is selected, read it as a Data URL and render it as a circular profile image
document.getElementById('photo-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const circle = document.getElementById('avatar-circle');
        circle.innerHTML = `<img src="${ev.target.result}" alt="Profile photo" style="width:88px;height:88px;object-fit:cover;border-radius:50%;">`;
    };
    reader.readAsDataURL(file);
});


// Hide the badge image if it fails to load (broken image fallback)
const badgeImg = document.getElementById('badgeImg');
badgeImg.addEventListener('load', () => { badgeImg.style.display = ''; });
badgeImg.addEventListener('error', () => { badgeImg.style.display = 'none'; });


// Handles sign-out: disables the button, calls Firebase sign-out, then redirects to login page
document.getElementById('signOutBtn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Signing out…';

    try {
        await firebaseSignOut(auth);
        window.location.href = 'Loginresponder.html';
    } catch (err) {
        console.error('Sign out failed:', err);
        // Re-enable the button so the user can try again
        btn.disabled = false;
        btn.textContent = 'Yes, Sign Out';
        alert('Failed to sign out. Please try again.');
    }
});

// Listen for Firebase auth state changes to load and display the correct user profile
const unsubscribe = onAuthStateChanged(auth, async (user) => {
    const nameEl  = document.getElementById('profileName');
    const emailEl = document.getElementById('profileEmail');

    // Attempts to retrieve a saved responder user from localStorage by email
    function loadFromLocalStorage(emailHint) {
        try {
            const users = JSON.parse(localStorage.getItem('responder_users') || '[]');
            const currentEmail = emailHint || localStorage.getItem('responder_current_email');
            // Match by email, or fall back to the last saved user if no email is available
            const match = currentEmail
                ? users.find(u => u.email === currentEmail)
                : users[users.length - 1];
            return match || null;
        } catch (e) { return null; }
    }

    // No Firebase user session — try loading profile from localStorage instead
    if (!user) {
        const localUser = loadFromLocalStorage(null);
        if (localUser) {
            // Resolve the best available display name from local data
            const name = localUser.fullName ||
                ((localUser.firstName || '') + ' ' + (localUser.lastName || '')).trim() ||
                localUser.username || 'User';
            nameEl.textContent  = name;
            emailEl.textContent = localUser.email || 'No email';
            setInitialsAvatar(name);
            populateExtraFields(localUser);
        } else {
            // No local data found — show a generic guest profile
            nameEl.textContent  = 'Guest User';
            emailEl.textContent = 'No email';
            setInitialsAvatar('Guest User');
        }
        return;
    }

    try {
        // First, try to fetch the user document from the "users" collection
        let docSnap = await getDoc(doc(db, "users", user.uid));
        let isResponder = false;

        // If not found in "users", check the "responders" collection
        if (!docSnap.exists()) {
            docSnap = await getDoc(doc(db, "responders", user.uid));
            isResponder = docSnap.exists();
        }

        let displayName = '';
        let email       = user.email;

        if (docSnap.exists()) {
            const data = docSnap.data();
            // Resolve display name from the most specific field available in Firestore
            displayName =
                data.fullName    ||
                data.displayName ||
                data.name        ||
                (data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : '') ||
                user.displayName ||
                '';
            email = data.email || user.email;
        } else {
            // No Firestore document found — fall back to the Firebase Auth display name
            displayName = user.displayName || '';
        }

        // If Firestore didn't have a display name, try filling it in from localStorage
        if (!displayName) {
            const localUser = loadFromLocalStorage(email);
            if (localUser) {
                displayName = localUser.fullName ||
                    ((localUser.firstName || '') + ' ' + (localUser.lastName || '')).trim() ||
                    localUser.username || '';
                email = localUser.email || email;
                populateExtraFields(localUser);
            }
        } else {
            // Display name was found in Firestore; still populate extra fields from localStorage if available
            const localUser = loadFromLocalStorage(email);
            if (localUser) populateExtraFields(localUser);
        }

        // Render the resolved name, email, and initials avatar on the profile page
        nameEl.textContent  = displayName || 'User';
        emailEl.textContent = email || 'No email';
        setInitialsAvatar(displayName || 'U');

    } catch (err) {
        // Firestore fetch failed — gracefully fall back to localStorage or Firebase Auth data
        console.error('Error loading user data:', err);
        const localUser = loadFromLocalStorage(user.email);
        const name = localUser
            ? (localUser.fullName || ((localUser.firstName || '') + ' ' + (localUser.lastName || '')).trim() || localUser.username)
            : (user.displayName || 'User');
        const email = localUser ? (localUser.email || user.email) : (user.email || 'No email');
        nameEl.textContent  = name || 'User';
        emailEl.textContent = email;
        if (localUser) populateExtraFields(localUser);
        setInitialsAvatar(name || 'U');
    }
});