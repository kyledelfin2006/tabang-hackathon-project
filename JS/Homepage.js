// Firebase imports: database, auth instance, Firestore doc helpers, and auth state/sign-out
import { auth, db } from "../javascript/firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Auth ─────────────────────────────────────────────────────────

onAuthStateChanged(auth, async (user) => {
    const drawerName   = document.getElementById('drawerName');
    const drawerEmail  = document.getElementById('drawerEmail');
    const drawerAvatar = document.getElementById('drawerAvatar');

    if (user) {
        let name = user.displayName || null;

        try {
            const userId = user.uid;

            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
                const data = userDoc.data();
                name = name || data.name || data.fullName || data.displayName || null;
            }

            if (!name) {
                const responderDoc = await getDoc(doc(db, 'responders', userId));
                if (responderDoc.exists()) {
                    const data = responderDoc.data();
                    name = name || data.fullName || data.name || data.displayName || null;
                }
            }
        } catch (err) {
            console.warn('Failed to load profile name from Firestore:', err);
        }

        name = name || (user.email ? user.email.split('@')[0] : 'Tabang User');

        drawerName.textContent  = name;
        drawerEmail.textContent = user.email || 'Aklan Resident';

        const initials = name.split(/\s+/).map(w => w[0].toUpperCase()).slice(0, 2).join('');
        drawerAvatar.innerHTML  = initials;
        drawerAvatar.style.fontSize = '16px';
        drawerAvatar.style.fontWeight = '800';
    } else {
        drawerName.textContent  = 'Not logged in';
        drawerEmail.textContent = 'Aklan Resident';
        drawerAvatar.innerHTML  = '<i class="fas fa-user" aria-hidden="true"></i>';
    }
});

// ─── Logout ───────────────────────────────────────────────────────

document.getElementById('drawerLogout').addEventListener('click', async () => {
    if (confirm('Are you sure you want to log out?')) {
        await signOut(auth);
        navigateTo('Login.html');
    }
});

// ─── Navigation Helper ────────────────────────────────────────────

window.navigateTo = function(path) { window.location.href = path; };

// ─── Bottom Nav ───────────────────────────────────────────────────

document.getElementById('navRequest').addEventListener('click', () => navigateTo('RequestHelp.html'));
document.getElementById('navHotlines').addEventListener('click', () => navigateTo('Hotline.html'));
document.getElementById('navReport').addEventListener('click', () => navigateTo('ReportFlood.html'));
document.getElementById('navMyReports').addEventListener('click', () => navigateTo('MyReports.html'));
document.getElementById('navAccount').addEventListener('click', () => navigateTo('AccountInfo.html'));

// ─── Quick Action Buttons ─────────────────────────────────────────

document.getElementById('quickReport').addEventListener('click', () => navigateTo('ReportFlood.html'));
document.getElementById('quickRequest').addEventListener('click', () => navigateTo('RequestHelp.html'));
document.getElementById('quickHotlines').addEventListener('click', () => navigateTo('Hotline.html'));

// ─── Info Modal ───────────────────────────────────────────────────

const infoModal = document.getElementById('infoModal');

function showModal(iconClass, title, desc) {
    document.getElementById('modalIcon').className = 'fas ' + iconClass;
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalDesc').textContent = desc;
    infoModal.classList.add('active');
    document.getElementById('closeModalBtn').focus();
}

function closeInfoModal() { infoModal.classList.remove('active'); }

document.getElementById('closeModalBtn').addEventListener('click', closeInfoModal);
infoModal.addEventListener('click', (e) => { if (e.target === infoModal) closeInfoModal(); });

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (infoModal.classList.contains('active')) closeInfoModal();
        if (document.getElementById('sideDrawer').classList.contains('open')) closeMenu();
        if (document.getElementById('notifPanel').classList.contains('open')) closeNotif();
    }
});

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
    sideOverlay.removeAttribute('aria-hidden');
    openMenuBtn.setAttribute('aria-expanded', 'true');
    document.getElementById('closeMenu').focus();
}

function closeMenu() {
    sideDrawer.classList.remove('open');
    sideOverlay.classList.remove('open');
    sideOverlay.setAttribute('aria-hidden', 'true');
    openMenuBtn.setAttribute('aria-expanded', 'false');
    openMenuBtn.focus();
}

openMenuBtn.addEventListener('click', openMenu);
document.getElementById('closeMenu').addEventListener('click', closeMenu);
sideOverlay.addEventListener('click', closeMenu);

document.querySelectorAll('.drawer-item[data-nav]').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.nav));
});

// ─── Notification Panel ───────────────────────────────────────────

const notifPanel   = document.getElementById('notifPanel');
const notifOverlay = document.getElementById('notifOverlay');
const notifBadge   = document.getElementById('notifBadge');
const openNotifBtn = document.getElementById('openNotif');

let notifDismissed = false;
let notifIsOpen    = false;

function openNotif() {
    if (notifIsOpen) return;
    notifIsOpen = true;
    notifPanel.classList.add('open');
    notifOverlay.classList.add('open');
    notifOverlay.removeAttribute('aria-hidden');
    openNotifBtn.setAttribute('aria-expanded', 'true');
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
    if (!notifDismissed) notifBadge.style.visibility = '';
}

openNotifBtn.addEventListener('click', openNotif);
document.getElementById('closeNotif').addEventListener('click', closeNotif);
notifOverlay.addEventListener('click', closeNotif);

// ─── Image Carousel ───────────────────────────────────────────────

(function initCarousel() {
    const track         = document.getElementById('carouselTrack');
    const dotsContainer = document.querySelector('.carousel-dots');
    const prevBtn       = document.getElementById('carouselPrev');
    const nextBtn       = document.getElementById('carouselNext');

    let current      = 0;
    let autoplayTimer = null;
    let startX       = 0;
    let isDragging   = false;
    let isAnimating  = false;

    const STORAGE_KEY = 'tabang_carousel_images';

    // ── Core helpers ──────────────────────────────────────────────

    function getSlides() { return track.querySelectorAll('.carousel-slide'); }
    function getTotal()  { return getSlides().length; }

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

    function syncDots() {
        dotsContainer.querySelectorAll('.carousel-dot').forEach((d, i) => {
            d.classList.toggle('active', i === current);
            d.setAttribute('aria-selected', String(i === current));
        });
    }

    function goTo(index) {
        if (isAnimating) return;
        isAnimating = true;

        const total = getTotal();
        current = ((index % total) + total) % total;
        track.style.transform = `translateX(-${current * 100}%)`;
        syncDots();
        updateCameraHint();

        setTimeout(() => { isAnimating = false; }, 420);
    }

    // ── Autoplay ──────────────────────────────────────────────────

    function startAutoplay() {
        if (autoplayTimer) return;
        autoplayTimer = setInterval(() => goTo(current + 1), 4000);
    }

    function stopAutoplay() {
        clearInterval(autoplayTimer);
        autoplayTimer = null;
    }

    function resetAutoplay() {
        stopAutoplay();
        startAutoplay();
    }

    const visibilityObserver = new IntersectionObserver((entries) => {
        entries[0].isIntersecting ? startAutoplay() : stopAutoplay();
    }, { threshold: 0.3 });
    visibilityObserver.observe(track);

    // ── Nav buttons ───────────────────────────────────────────────

    prevBtn.addEventListener('click', () => { goTo(current - 1); resetAutoplay(); });
    nextBtn.addEventListener('click', () => { goTo(current + 1); resetAutoplay(); });

    // ── Touch / swipe ─────────────────────────────────────────────

    let lastTap    = 0;
    let pressTimer = null;

    track.addEventListener('touchstart', (e) => {
        startX     = e.touches[0].clientX;
        isDragging = true;
        pressTimer = setTimeout(() => carouselFileInput.click(), 500);
    }, { passive: true });

    track.addEventListener('touchmove', () => {
        clearTimeout(pressTimer);
    }, { passive: true });

    track.addEventListener('touchend', (e) => {
        clearTimeout(pressTimer);
        if (!isDragging) return;
        isDragging = false;

        const now = Date.now();
        if (now - lastTap < 300) {
            carouselFileInput.click();
            lastTap = 0;
            return;
        }
        lastTap = now;

        const diff = startX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 40) {
            goTo(diff > 0 ? current + 1 : current - 1);
            resetAutoplay();
        }
    }, { passive: true });

    track.addEventListener('dblclick', () => carouselFileInput.click());

    // ── Keyboard ──────────────────────────────────────────────────

    track.parentElement.setAttribute('tabindex', '0');
    track.parentElement.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft')  { goTo(current - 1); resetAutoplay(); }
        if (e.key === 'ArrowRight') { goTo(current + 1); resetAutoplay(); }
    });

    // ── Camera hint ───────────────────────────────────────────────

    function updateCameraHint() {
        track.querySelectorAll('.slide-upload-hint').forEach(h => h.remove());
        const slides = getSlides();
        if (!slides[current]) return;

        const hint = document.createElement('div');
        hint.className = 'slide-upload-hint';
        hint.innerHTML = '<i class="fas fa-camera"></i>';
        hint.style.cssText = `
            position:absolute; bottom:28px; right:10px;
            background:rgba(0,0,0,0.45); color:white;
            border-radius:50%; width:28px; height:28px;
            display:flex; align-items:center; justify-content:center;
            font-size:12px; pointer-events:none; z-index:15;
        `;
        slides[current].style.position = 'relative';
        slides[current].appendChild(hint);
    }

    // ── Slide creation ────────────────────────────────────────────

    function addSlide(src, isReport = false) {
        const slide = document.createElement('div');
        slide.className = 'carousel-slide';
        slide.style.position = 'relative';

        const img = document.createElement('img');
        img.className = 'hero-image';
        img.src       = src;
        img.alt       = isReport ? 'Community flood report image' : 'User uploaded image';
        img.loading   = 'lazy';
        slide.appendChild(img);

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
            slide.appendChild(badge);
        }

        track.appendChild(slide);
        // Do NOT call rebuildDots() here — batch callers do it once after all slides are added
    }

    // ── Toast ─────────────────────────────────────────────────────

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
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
    }

    // ── File input ────────────────────────────────────────────────

    const carouselFileInput = document.createElement('input');
    carouselFileInput.type     = 'file';
    carouselFileInput.accept   = 'image/*';
    carouselFileInput.multiple = true;
    carouselFileInput.style.display = 'none';
    document.body.appendChild(carouselFileInput);

    carouselFileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                addSlide(ev.target.result);
                rebuildDots();
                saveImages();
                goTo(getTotal() - 1);
                showUploadToast(`Image added! (${getTotal()} slides total)`);
            };
            reader.readAsDataURL(file);
        });
        carouselFileInput.value = '';
    });

    // ── Persist user uploads ──────────────────────────────────────

    function saveImages() {
        try {
            const srcs    = Array.from(track.querySelectorAll('.carousel-slide img')).map(i => i.src);
            const uploads = srcs.filter(s => s.startsWith('data:'));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(uploads));
        } catch (_) {}
    }

    function loadSavedImages() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            saved.forEach(url => { if (url) addSlide(url); });
            if (saved.length) rebuildDots();
        } catch (_) {}
    }

    // ── Firestore report images ───────────────────────────────────

    async function loadReportImagesFromFirestore() {
        try {
            const [floodSnap, helpSnap] = await Promise.all([
                getDocs(collection(db, 'floodReports')),
                getDocs(collection(db, 'helpRequests'))
            ]);

            const urls = [...floodSnap.docs, ...helpSnap.docs]
                .flatMap(d => {
                    const data = d.data();
                    return Array.isArray(data.imageUrls) ? data.imageUrls : [];
                })
                .filter(u => typeof u === 'string' && u.trim())
                .filter((u, i, a) => a.indexOf(u) === i);

            urls.forEach(url => addSlide(url, true));

            if (urls.length) {
                rebuildDots();
                goTo(0);
            }
        } catch (err) {
            console.warn('Could not load report images from Firestore:', err);
        }
    }

    // ── Init ──────────────────────────────────────────────────────

    rebuildDots();
    goTo(0);
    startAutoplay();

    loadSavedImages();
    loadReportImagesFromFirestore();

})();