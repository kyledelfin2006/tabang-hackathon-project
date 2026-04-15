// Firebase imports: database, auth instance, Firestore doc helpers, and auth state/sign-out
import { db, auth } from "../javascript/firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged, signOut as firebaseSignOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── Modal Helpers ───────────────────────────────────────────────

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('show');
        const focusable = modal.querySelector('button, [tabindex="0"]');
        if (focusable) focusable.focus();
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('show');
}

window.openModal = openModal;
window.closeModal = closeModal;

// ─── Modal Overlay Click (close on backdrop) ──────────────────────

document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(overlay.id);
    });
});

// ─── Modal Close Buttons ──────────────────────────────────────────

document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

// ─── Keyboard: close modal on Escape ─────────────────────────────

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.show').forEach(m => closeModal(m.id));
    }
});

// ─── Menu Items ───────────────────────────────────────────────────

function bindMenuClick(id, action) {
    const el = document.getElementById(id);
    if (!el) return;
    const activate = () => action();
    el.addEventListener('click', activate);
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
}

bindMenuClick('menu-notif',    () => openModal('modal-notif'));
bindMenuClick('menu-help',     () => openModal('modal-help'));
bindMenuClick('menu-settings', () => openModal('modal-settings'));
bindMenuClick('menu-signout',  () => openModal('modal-signout'));
bindMenuClick('menu-verify',   () => { window.location.href = 'VerAcc.html'; });

// ─── Back Button ──────────────────────────────────────────────────

document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'Homepage.html';
});

// ─── Toggle Switches ─────────────────────────────────────────────

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

// ─── Avatar / Profile Photo ───────────────────────────────────────

document.getElementById('avatarWrapper').addEventListener('click', () => {
    document.getElementById('photo-input').click();
});

function setInitialsAvatar(name) {
    const initials = name
        .split(' ')
        .map(w => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || '?';
    document.getElementById('avatar-initials').textContent = initials;
}

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

// ─── Badge Image ──────────────────────────────────────────────────

const badgeImg = document.getElementById('badgeImg');
badgeImg.addEventListener('load', () => { badgeImg.style.display = ''; });
badgeImg.addEventListener('error', () => { badgeImg.style.display = 'none'; });

// ─── Sign Out ─────────────────────────────────────────────────────

document.getElementById('signOutBtn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Signing out…';

    try {
        await firebaseSignOut(auth);
        window.location.href = 'Login.html';
    } catch (err) {
        console.error('Sign out failed:', err);
        btn.disabled = false;
        btn.textContent = 'Yes, Sign Out';
        alert('Failed to sign out. Please try again.');
    }
});

// ─── Load User Profile ────────────────────────────────────────────

const unsubscribe = onAuthStateChanged(auth, async (user) => {
    const nameEl  = document.getElementById('profileName');
    const emailEl = document.getElementById('profileEmail');

    if (!user) {
        nameEl.textContent  = 'Guest User';
        emailEl.textContent = 'No email';
        setInitialsAvatar('Guest User');
        return;
    }

    try {
        const docSnap = await getDoc(doc(db, "users", user.uid));

        let displayName = '';
        let email       = user.email;

        if (docSnap.exists()) {
            const data = docSnap.data();

            displayName =
                data.fullName    ||
                data.displayName ||
                data.name        ||
                (data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : '') ||
                user.displayName ||
                '';

            email = data.email || user.email;
        } else {
            displayName = user.displayName || '';
        }

        nameEl.textContent  = displayName || 'User';
        emailEl.textContent = email || 'No email';
        setInitialsAvatar(displayName || 'U');

    } catch (err) {
        console.error('Error loading user data:', err);
        nameEl.textContent  = user.displayName || 'User';
        emailEl.textContent = user.email || 'No email';
        setInitialsAvatar(user.displayName || 'U');
    }
});