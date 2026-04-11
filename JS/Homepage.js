// Firebase imports: database, auth instance, Firestore doc helpers, and auth state/sign-out
import { auth, db } from "../javascript/firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Auth ─────────────────────────────────────────────────────────

// Watch auth state on mount. We do this instead of a one-time
// getCurrentUser() call so the UI updates instantly if the session
// expires while the tab is open (e.g., token revoked on another device).
onAuthStateChanged(auth, async (user) => {
    const drawerName   = document.getElementById('drawerName');
    const drawerEmail  = document.getElementById('drawerEmail');
    const drawerAvatar = document.getElementById('drawerAvatar');

    if (user) {
        // Start with whatever auth already gave us — could be null
        // if they signed in with email/password and never set a display name.
        let name = user.displayName || null;

        try {
            const userId = user.uid;

            // First check the 'users' collection (regular residents).
            // Most people will be here; this should hit cache most of the time.
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
                const data = userDoc.data();
                // Try a few field names since we weren't consistent early on 😅
                name = name || data.name || data.fullName || data.displayName || null;
            }

            // If still no name, maybe they're a responder (MDRRMO, barangay, etc.)
            // Slightly redundant but better than showing a blank name in the drawer.
            if (!name) {
                const responderDoc = await getDoc(doc(db, 'responders', userId));
                if (responderDoc.exists()) {
                    const data = responderDoc.data();
                    name = name || data.fullName || data.name || data.displayName || null;
                }
            }
        } catch (err) {
            // Non-fatal — Firestore might be offline or rules might have changed.
            // We'll fall back to the email prefix below so the UI still works.
            console.warn('Failed to load profile name from Firestore:', err);
        }

        // Last resort: derive a readable name from the email address.
        // "juan.dela.cruz@gmail.com" → "juan.dela.cruz" which is... fine enough.
        name = name || (user.email ? user.email.split('@')[0] : 'Tabang User');

        drawerName.textContent  = name;
        drawerEmail.textContent = user.email || 'Aklan Resident';

        // Build initials for the avatar — max 2 chars so it fits the circle
        const initials = name.split(/\s+/).map(w => w[0].toUpperCase()).slice(0, 2).join('');
        drawerAvatar.innerHTML  = initials;
        drawerAvatar.style.fontSize = '16px';
        drawerAvatar.style.fontWeight = '800';
    } else {
        // Not logged in — show defaults. The protected pages will redirect
        // to Login.html anyway, but this keeps the drawer looking clean.
        drawerName.textContent  = 'Not logged in';
        drawerEmail.textContent = 'Aklan Resident';
        drawerAvatar.innerHTML  = '<i class="fas fa-user" aria-hidden="true"></i>';
    }
});

// ─── Logout ───────────────────────────────────────────────────────

document.getElementById('drawerLogout').addEventListener('click', async () => {
    // Quick confirm so users don't accidentally boot themselves out
    if (confirm('Are you sure you want to log out?')) {
        await signOut(auth);
        navigateTo('Login.html');
    }
});

// ─── Navigation Helper ────────────────────────────────────────────

// Wrapping location.href in a function so we have one place to swap
// this out if we ever move to a SPA router. Also makes it easier to mock in tests.
window.navigateTo = function(path) { window.location.href = path; };

// ─── Bottom Nav ───────────────────────────────────────────────────

// Straightforward — each tab just routes to its own page.
// No active state logic here yet; each page highlights its own tab on load.
document.getElementById('navRequest').addEventListener('click', () => navigateTo('RequestHelp.html'));
document.getElementById('navHotlines').addEventListener('click', () => navigateTo('Hotline.html'));
document.getElementById('navReport').addEventListener('click', () => navigateTo('ReportFlood.html'));
document.getElementById('navMyReports').addEventListener('click', () => navigateTo('MyReports.html'));
document.getElementById('navAccount').addEventListener('click', () => navigateTo('AccountInfo.html'));

// ─── Quick Action Buttons ─────────────────────────────────────────

// These are the hero shortcuts — same destinations as bottom nav,
// just surfaced higher up for first-time users who haven't learned the tab bar yet.
document.getElementById('quickReport').addEventListener('click', () => navigateTo('ReportFlood.html'));
document.getElementById('quickRequest').addEventListener('click', () => navigateTo('RequestHelp.html'));
document.getElementById('quickHotlines').addEventListener('click', () => navigateTo('Hotline.html'));

// ─── Info Modal ───────────────────────────────────────────────────

const infoModal = document.getElementById('infoModal');

// Reusable modal helper — pass in the icon class (without the 'fas' prefix),
// a title, and a description. Keeps the resource cards lean.
function showModal(iconClass, title, desc) {
    document.getElementById('modalIcon').className = 'fas ' + iconClass;
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalDesc').textContent = desc;
    infoModal.classList.add('active');
    // Move focus into the modal so keyboard/screen-reader users aren't stranded
    document.getElementById('closeModalBtn').focus();
}

function closeInfoModal() { infoModal.classList.remove('active'); }

document.getElementById('closeModalBtn').addEventListener('click', closeInfoModal);

// Let users dismiss by clicking the backdrop — feels more native
infoModal.addEventListener('click', (e) => { if (e.target === infoModal) closeInfoModal(); });

// Global Escape handler — closes whichever overlay is currently open.
// Priority: modal > drawer > notif panel (in case somehow two are open at once).
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (infoModal.classList.contains('active')) closeInfoModal();
        if (document.getElementById('sideDrawer').classList.contains('open')) closeMenu();
        if (document.getElementById('notifPanel').classList.contains('open')) closeNotif();
    }
});

// Resource card actions — just showing static info for now.
// TODO: link Safety Tips and First Aid to actual content pages once they're ready.
document.getElementById('resSafety').addEventListener('click', () =>
    showModal('fa-shield-alt', 'Safety Tips', 'Stay indoors, avoid floodwaters, move to higher ground, and keep emergency contacts ready.')
);
document.getElementById('resEvac').addEventListener('click', () =>
    showModal('fa-map-marker-alt', 'Evacuation Centers', 'Contact your barangay hall or go to the nearest covered court or school gymnasium.')
);
document.getElementById('resFirstaid').addEventListener('click', () =>
    showModal('fa-book-medical', 'First Aid Guides', 'Keep wounds dry, treat for shock, and call 911 for serious injuries.')
);

// ─── Side Drawer ──────────────────────────────────────────────────

const sideDrawer  = document.getElementById('sideDrawer');
const sideOverlay = document.getElementById('sideOverlay');
const openMenuBtn = document.getElementById('openMenu');

function openMenu() {
    sideDrawer.classList.add('open');
    sideOverlay.classList.add('open');
    // aria-hidden on the overlay was set to 'true' by default in HTML;
    // remove it now so screen readers don't announce it as hidden while it's visible
    sideOverlay.removeAttribute('aria-hidden');
    openMenuBtn.setAttribute('aria-expanded', 'true');
    document.getElementById('closeMenu').focus();
}

function closeMenu() {
    sideDrawer.classList.remove('open');
    sideOverlay.classList.remove('open');
    sideOverlay.setAttribute('aria-hidden', 'true');
    openMenuBtn.setAttribute('aria-expanded', 'false');
    // Return focus to the trigger button so keyboard users don't get lost
    openMenuBtn.focus();
}

openMenuBtn.addEventListener('click', openMenu);
document.getElementById('closeMenu').addEventListener('click', closeMenu);
// Tapping the dim overlay closes the drawer — standard mobile pattern
sideOverlay.addEventListener('click', closeMenu);

// Wire up all nav items in the drawer. data-nav holds the target URL.
// Could also just be <a> tags but buttons let us intercept and add transitions later.
document.querySelectorAll('.drawer-item[data-nav]').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.nav));
});

// ─── Notification Panel ───────────────────────────────────────────

const notifPanel   = document.getElementById('notifPanel');
const notifOverlay = document.getElementById('notifOverlay');
const notifBadge   = document.getElementById('notifBadge');
const openNotifBtn = document.getElementById('openNotif');

// Track whether the user has seen the notifs this session.
// We hide the badge the moment they open the panel — not after they close it —
// so it doesn't flash back while they're still reading.
let notifDismissed = false;
let notifIsOpen = false;

function openNotif() {
    if (notifIsOpen) return;
    notifIsOpen = true;
    notifPanel.classList.add('open');
    notifOverlay.classList.add('open');
    notifOverlay.removeAttribute('aria-hidden');
    openNotifBtn.setAttribute('aria-expanded', 'true');
    // Hide badge immediately on open — feels more responsive than waiting for close
    notifBadge.style.visibility = 'hidden';
    notifDismissed = true;
}

function closeNotif() {
    if (!notifIsOpen) return;
    notifIsOpen = false;
    notifPanel.classList.remove('open');
    notifOverlay.classList.remove('open');
    notifOverlay.setAttribute('aria-hidden', 'true');
    openNotifBtn.setAttribute('aria-expanded', 'false');
    // Only restore the badge if they somehow closed without actually opening
    // (shouldn't happen, but just being safe)
    if (!notifDismissed) notifBadge.style.visibility = '';
}

openNotifBtn.addEventListener('click', openNotif);
document.getElementById('closeNotif').addEventListener('click', closeNotif);
notifOverlay.addEventListener('click', closeNotif);

// ─── Dashboard button ─────────────────────────────────────────────
// Navigation is handled inline via onclick on the button element above.
// Keeping it there so it works even before this script fully loads —
// important for slow connections during emergencies.