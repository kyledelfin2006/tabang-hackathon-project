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

// ─── Navigation is handled inline via onclick on the button element above.
// Keeping it there so it works even before this script fully loads —
// important for slow connections during emergencies.

// ─── Image Carousel ───────────────────────────────────────────────

(function initCarousel() {
    const track      = document.getElementById('carouselTrack');
    const dotsContainer = document.querySelector('.carousel-dots');
    const prevBtn    = document.getElementById('carouselPrev');
    const nextBtn    = document.getElementById('carouselNext');

    let current      = 0;
    let autoplayTimer = null;
    let startX       = 0;
    let isDragging   = false;

    // Always read live count so newly added slides are included
    function getTotal() { return track.querySelectorAll('.carousel-slide').length; }
    function getDots()  { return dotsContainer.querySelectorAll('.carousel-dot'); }

    function goTo(index) {
        const total = getTotal();
        current = (index + total) % total;
        track.style.transform = `translateX(-${current * 100}%)`;
        getDots().forEach((d, i) => {
            d.classList.toggle('active', i === current);
            d.setAttribute('aria-selected', String(i === current));
        });
    }

    // Rebuild dot indicators to match current slide count
    function rebuildDots() {
        const total = getTotal();
        dotsContainer.innerHTML = '';
        for (let i = 0; i < total; i++) {
            const dot = document.createElement('button');
            dot.className = 'carousel-dot' + (i === current ? ' active' : '');
            dot.dataset.index = i;
            dot.setAttribute('role', 'tab');
            dot.setAttribute('aria-selected', String(i === current));
            dot.setAttribute('aria-label', `Slide ${i + 1}`);
            dot.addEventListener('click', () => { goTo(i); resetAutoplay(); });
            dotsContainer.appendChild(dot);
        }
    }

    // Buttons
    prevBtn.addEventListener('click', () => { goTo(current - 1); resetAutoplay(); });
    nextBtn.addEventListener('click', () => { goTo(current + 1); resetAutoplay(); });

    rebuildDots();

    // Dot clicks are wired inside rebuildDots() dynamically

    // Touch / swipe support
    track.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
    }, { passive: true });

    track.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        const diff = startX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 40) {
            goTo(diff > 0 ? current + 1 : current - 1);
            resetAutoplay();
        }
        isDragging = false;
    }, { passive: true });

    // Auto-advance every 4 seconds
    function startAutoplay() {
        autoplayTimer = setInterval(() => goTo(current + 1), 4000);
    }
    function resetAutoplay() {
        clearInterval(autoplayTimer);
        startAutoplay();
    }

    // Pause when the phone-scroll container is not visible
    const observer = new IntersectionObserver((entries) => {
        entries[0].isIntersecting ? startAutoplay() : clearInterval(autoplayTimer);
    }, { threshold: 0.3 });
    observer.observe(track);

    // Keyboard: left/right arrow keys when carousel is focused
    track.parentElement.setAttribute('tabindex', '0');
    track.parentElement.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft')  { goTo(current - 1); resetAutoplay(); }
        if (e.key === 'ArrowRight') { goTo(current + 1); resetAutoplay(); }
    });

    goTo(0); // initialise
    startAutoplay();

    // ── User Image Upload for Carousel ──────────────────────────────
    // Every uploaded image is ADDED as a new slide at the end of the carousel.
    const STORAGE_KEY = 'tabang_carousel_images';
    const REPORT_IMAGES_KEY = 'tabang_carousel_report_images';

    // Load previously saved images from localStorage (persists across sessions)
    function loadSavedImages() {
        try {
            // 1. Load user-uploaded carousel images (added via double-tap on homepage)
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            saved.forEach((dataUrl) => {
                if (dataUrl) addSlide(dataUrl);
            });

            // 2. Load report images synced from MyReports page
            const reportImages = JSON.parse(localStorage.getItem(REPORT_IMAGES_KEY) || '[]');
            reportImages.forEach((url) => {
                if (url) addSlide(url, /* isReport */ true);
            });
        } catch (_) {}
    }

    function saveImages() {
        try {
            // Save only user-uploaded slides (those after the original 3)
            const slides = track.querySelectorAll('.carousel-slide img');
            const allSrcs = Array.from(slides).map(img => img.src);
            // Only save data URLs (user uploads), not the original image paths
            const uploads = allSrcs.filter(src => src.startsWith('data:'));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(uploads));
        } catch (_) {}
    }

    // Creates and appends a new slide + dot for the given image src
    function addSlide(src, isReport = false) {
        const slide = document.createElement('div');
        slide.className = 'carousel-slide';
        const img = document.createElement('img');
        img.className = 'hero-image';
        img.src = src;
        img.alt = isReport ? 'Community flood report image' : 'User uploaded image';
        slide.appendChild(img);

        // Add a small "Community Report" badge on report images
        if (isReport) {
            const badge = document.createElement('div');
            badge.style.cssText = `
                position:absolute; top:8px; left:8px;
                background:rgba(220,53,69,0.85); color:white;
                border-radius:10px; padding:3px 8px;
                font-size:10px; font-weight:700; font-family:'Inter',sans-serif;
                z-index:15; pointer-events:none;
                display:flex; align-items:center; gap:4px;
            `;
            badge.innerHTML = '<i class="fas fa-flag" style="font-size:9px;"></i> Community Report';
            slide.style.position = 'relative';
            slide.appendChild(badge);
        }

        track.appendChild(slide);
        rebuildDots();
    }

    // Hidden file input — triggered by double-tap / double-click / long-press
    const carouselFileInput = document.createElement('input');
    carouselFileInput.type = 'file';
    carouselFileInput.accept = 'image/*';
    carouselFileInput.multiple = true; // allow picking multiple at once
    carouselFileInput.style.display = 'none';
    document.body.appendChild(carouselFileInput);

    // Long-press (500ms) or double-tap on a slide to add an image
    let pressTimer = null;
    let lastTap = 0;

    track.addEventListener('touchstart', () => {
        pressTimer = setTimeout(() => {
            carouselFileInput.click();
        }, 500);
    }, { passive: true });

    track.addEventListener('touchend', () => {
        clearTimeout(pressTimer);
        // Double-tap detection
        const now = Date.now();
        if (now - lastTap < 300) {
            carouselFileInput.click();
        }
        lastTap = now;
    }, { passive: true });

    // Desktop: double-click to add
    track.addEventListener('dblclick', () => {
        carouselFileInput.click();
    });

    carouselFileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                addSlide(ev.target.result);
                saveImages();
                // Navigate to the newly added slide
                goTo(getTotal() - 1);
                showUploadToast(`Image added! (${getTotal()} slides total)`);
            };
            reader.readAsDataURL(file);
        });
        // Reset so same file can be re-selected
        carouselFileInput.value = '';
    });

    // Add a small camera hint overlay on the active slide
    function updateCameraHint() {
        track.querySelectorAll('.slide-upload-hint').forEach(h => h.remove());
        const slides = track.querySelectorAll('.carousel-slide');
        if (slides[current]) {
            const hint = document.createElement('div');
            hint.className = 'slide-upload-hint';
            hint.innerHTML = '<i class="fas fa-camera"></i>';
            hint.style.cssText = `
                position:absolute; bottom:28px; right:10px;
                background:rgba(0,0,0,0.45); color:white;
                border-radius:50%; width:28px; height:28px;
                display:flex; align-items:center; justify-content:center;
                font-size:12px; pointer-events:none; z-index:15;
                transition:opacity 0.3s;
            `;
            slides[current].style.position = 'relative';
            slides[current].appendChild(hint);
        }
    }

    // Toast notification
    function showUploadToast(msg) {
        let toast = document.getElementById('carouselToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'carouselToast';
            toast.style.cssText = `
                position:absolute; bottom:80px; left:50%; transform:translateX(-50%);
                background:rgba(0,0,0,0.75); color:white;
                padding:8px 16px; border-radius:20px;
                font-size:12px; font-weight:600; font-family:'Inter',sans-serif;
                z-index:200; opacity:0; transition:opacity 0.3s; white-space:nowrap;
            `;
            document.querySelector('.phone').appendChild(toast);
        }
        toast.textContent = msg;
        toast.style.opacity = '1';
        setTimeout(() => { toast.style.opacity = '0'; }, 2000);
    }

    // Update camera hint whenever the slide transition ends
    track.addEventListener('transitionend', updateCameraHint, { passive: true });

    loadSavedImages();
    goTo(0);
    startAutoplay();
    setTimeout(updateCameraHint, 100);
})();