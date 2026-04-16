// Firebase imports: auth, database instance, email sign-in helper, and Firestore doc helpers
import { db, auth } from "../javascript/firebase.js";
import {
    collection, deleteDoc, doc, getDoc, updateDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── State ───────────────────────────────────────────────────────────────
let currentFilter = 'all';
let pendingDelete = null;
let currentUser = null;
let previewMap = null;
let previewMarker = null;

// In-memory cache kept fresh by onSnapshot listeners
let allItems = [];
let unsubFlood = null;
let unsubHelp  = null;

const overlay      = document.getElementById('confirmOverlay');
const filterBtns   = document.querySelectorAll('.filter-btn');
const searchInput  = document.getElementById('searchInput');
const reportsList  = document.getElementById('reportsList');
const mapModal     = document.getElementById('mapPreviewModal');

// ─── Utility helpers ─────────────────────────────────────────────────────
function navigateTo(page) {
    window.location.href = page;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function toDate(timestamp) {
    if (!timestamp) return null;
    if (timestamp.toDate) return timestamp.toDate();
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? null : d;
}

function formatDate(timestamp) {
    const date = toDate(timestamp);
    if (!date) return '—';
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatSubmittedAt(timestamp) {
    const date = toDate(timestamp);
    if (!date) return '—';
    return date.toLocaleString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit'
    });
}

// ─── Map preview functions ───────────────────────────────────────────────
function openMapPreview(lat, lng, title) {
    mapModal.style.display = 'flex';
    setTimeout(() => {
        const container = document.getElementById('previewMap');
        if (!container) return;
        if (previewMap) { previewMap.remove(); previewMap = null; }
        previewMap = L.map(container).setView([lat, lng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(previewMap);
        previewMarker = L.marker([lat, lng], { draggable: false }).addTo(previewMap);
        previewMarker.bindPopup(title).openPopup();
    }, 100);
}

function closeMapPreview() {
    mapModal.style.display = 'none';
    if (previewMap) { previewMap.remove(); previewMap = null; }
}

// ─── Image preview ───────────────────────────────────────────────────────
function openImagePreview(src) {
    const modal = document.getElementById('imagePreview');
    const img   = document.getElementById('previewImg');
    img.src = src;
    img.classList.remove('zoomed');
    modal.style.display = 'flex';
}

function closeImagePreview() {
    document.getElementById('imagePreview').style.display = 'none';
}

document.getElementById('previewImg').addEventListener('click', function () {
    this.classList.toggle('zoomed');
});

// ─── Auth ────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    filterBtns.forEach(btn => btn.disabled = false);
    if (searchInput) searchInput.disabled = false;
    attachListeners();
});

// ─── Real-time Firestore listeners ────────────────────────────────────────
// Keeps the list in sync live — so when a responder sets status to 'responding',
// the "Mark as Responded" button appears on the user side automatically.
function attachListeners() {
    if (unsubFlood) unsubFlood();
    if (unsubHelp)  unsubHelp();

    let floodItems = [];
    let helpItems  = [];

    const merge = () => {
        allItems = [...floodItems, ...helpItems];
        renderList();
    };

    unsubFlood = onSnapshot(collection(db, 'floodReports'), snap => {
        floodItems = snap.docs.map(d => ({ ...d.data(), id: d.id, type: 'flood' }));
        merge();
    }, err => console.error('floodReports listener error:', err));

    unsubHelp = onSnapshot(collection(db, 'helpRequests'), snap => {
        helpItems = snap.docs.map(d => ({ ...d.data(), id: d.id, type: 'help' }));
        merge();
    }, err => console.error('helpRequests listener error:', err));
}

// ─── Delete confirmation ──────────────────────────────────────────────────
document.getElementById('confirmCancel').addEventListener('click', () => {
    overlay.classList.remove('show');
    pendingDelete = null;
});

document.getElementById('confirmDelete').addEventListener('click', () => {
    overlay.classList.remove('show');
    if (!pendingDelete) return;
    const { id, isFlood, cardEl } = pendingDelete;
    pendingDelete = null;
    cardEl.classList.add('deleting');
    setTimeout(() => deleteEntry(id, isFlood), 300);
});

function showConfirm(id, isFlood, cardEl) {
    pendingDelete = { id, isFlood, cardEl };
    document.getElementById('confirmTitle').textContent = isFlood ? 'Delete Report?' : 'Delete Request?';
    overlay.classList.add('show');
}

async function deleteEntry(id, isFlood) {
    const collectionName = isFlood ? 'floodReports' : 'helpRequests';
    await deleteDoc(doc(db, collectionName, id));
    // renderList will be called automatically by onSnapshot
}

// ─── "Responded" — user-side action ───────────────────────────────────────
// Called when the reporter taps the "Responded" button on their card.
// This is the ONLY way responderStatus can reach 'responded'.
async function markAsResponded(reportId, reportType, btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating…';

    try {
        const collectionName = reportType === 'help' ? 'helpRequests' : 'floodReports';
        await updateDoc(doc(db, collectionName, reportId), {
            responderStatus: 'responded'
        });
        // onSnapshot will automatically re-render the card with the final badge
    } catch (err) {
        console.error('Failed to mark as responded:', err);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check-circle"></i> Responded';
    }
}

window.markAsResponded = markAsResponded;

// ─── Enrich report names from Firestore users/responders collection ───────
async function enrichReportNames(items) {
    const cache = new Map();
    const promises = items.map(async item => {
        if (!item.userId) return;
        if (cache.has(item.userId)) {
            item.reporterName = cache.get(item.userId);
            return;
        }
        try {
            const userRef  = doc(db, 'users', item.userId);
            const userSnap = await getDoc(userRef);
            let name = null;
            if (userSnap.exists()) {
                const data = userSnap.data();
                name = data.name || data.fullName || data.displayName || null;
            }
            if (!name) {
                const responderRef  = doc(db, 'responders', item.userId);
                const responderSnap = await getDoc(responderRef);
                if (responderSnap.exists()) {
                    const data = responderSnap.data();
                    name = data.fullName || data.name || data.displayName || null;
                }
            }
            if (!name && item.submittedBy && item.submittedBy.includes('@')) {
                name = item.submittedBy.split('@')[0];
            }
            cache.set(item.userId, name);
            item.reporterName = name;
        } catch (err) {
            console.warn('Could not enrich reporter name', err);
        }
    });
    await Promise.all(promises);
}

// ─── Filter ───────────────────────────────────────────────────────────────
function setFilter(filter) {
    currentFilter = filter;
    ['All', 'Flood', 'Help'].forEach(type => {
        const btn = document.getElementById('filter' + type);
        btn.className = 'filter-btn' + (type.toLowerCase() === filter ? ` active-${filter}` : '');
    });
    renderList();
}

// ─── Build image gallery HTML ─────────────────────────────────────────────
function buildImageGallery(imageUrls) {
    if (!imageUrls || imageUrls.length === 0) return '';
    const maxVisible    = 4;
    const visibleImages = imageUrls.slice(0, maxVisible);
    const extraCount    = imageUrls.length - maxVisible;
    const thumbnails = visibleImages.map(url => `
            <img class="gallery-thumb"
                 src="${escapeHtml(url)}"
                 alt="Report image"
                 loading="lazy"
                 onclick="openImagePreview('${escapeHtml(url)}')">
        `).join('');
    const moreLabel = extraCount > 0 ? `<div class="gallery-more">+${extraCount}</div>` : '';
    return `<div class="image-gallery">${thumbnails}${moreLabel}</div>`;
}

// ─── Responder status display (read-only badges + "Responded" button) ────────
//
// What the USER sees on their own card:
//
//   No status / 'respond'  → nothing shown
//   'responding'           → amber "Responding…" badge  +  green "Responded" button
//   'responded'            → green "Responded ✓" badge  (no further action needed)
//
function buildResponderStatusHtml(r) {
    const status = r.responderStatus || 'respond';

    if (status === 'responded') {
        return `
            <div class="responder-status-area" style="margin-top:12px;">
                <span class="responder-status-badge badge-responded">
                    <i class="fas fa-check-circle"></i> Responded
                </span>
            </div>`;
    }

    if (status === 'responding') {
        return `
            <div class="responder-status-area">
                <div class="responder-action-box">
                    <div class="action-hint">
                        <i class="fas fa-bell"></i>
                        A responder is on the way — tap below once they've arrived or resolved your report.
                    </div>
                    <div class="action-row">
                        <span class="responder-status-badge badge-responding">
                            <i class="fas fa-spinner fa-spin"></i> Responding…
                        </span>
                        <button class="mark-responded-btn"
                                onclick="markAsResponded('${escapeHtml(r.id)}', '${escapeHtml(r.type)}', this)"
                                title="Confirm the responder has arrived / resolved your report">
                            <i class="fas fa-check-circle"></i> Responded
                        </button>
                    </div>
                </div>
            </div>`;
    }

    // 'respond' or no status — show nothing
    return '';
}

// ─── Build a single card's HTML ───────────────────────────────────────────
function buildCard(r) {
    const isHelp    = r.type === 'help';
    // Match by uid, email, or displayName — covers all Firestore storage patterns
    const isOwner   = currentUser && (
        r.userId      === currentUser.uid                                          ||
        r.submittedBy === currentUser.email                                        ||
        r.submittedBy === currentUser.displayName                                  ||
        (currentUser.email && r.submittedBy &&
            r.submittedBy.toLowerCase() === currentUser.email.toLowerCase())
    );
    const hasCoords = r.latitude && r.longitude;

    const cardClass    = `report-card${isHelp ? ' help-card' : ''}${isOwner ? ' own-card' : ''}`;
    const dividerClass = isHelp ? 'card-divider help-divider' : 'card-divider';
    const iconClass    = isHelp ? 'row-icon help-row-icon' : 'row-icon';
    const ownerName    = escapeHtml(r.reporterName || r.name || r.submittedBy || 'Unknown');

    // Delete button (only for own entries)
    const deleteBtn = isOwner
        ? `<button class="card-delete-btn"
                   data-id="${escapeHtml(r.id)}"
                   data-isflood="${r.type === 'flood'}"
                   title="Delete">
               <i class="fas fa-trash-alt"></i>
           </button>`
        : '';

    // Location button
    let locationBtn = '';
    if (hasCoords) {
        const lat   = r.latitude;
        const lng   = r.longitude;
        const title = isHelp
            ? `Help request by ${escapeHtml(r.name || r.submittedBy || 'Anonymous')}`
            : `Flood report at ${escapeHtml(r.location || 'unknown location')}`;
        locationBtn = `<button class="card-location-btn" onclick="openMapPreview(${lat}, ${lng}, '${escapeHtml(title)}')">
                           <i class="fas fa-map-marker-alt"></i> View on map
                       </button>`;
    }

    const situationText = isHelp ? (r.description || '—') : (r.details || '—');
    const rows = `
            <div class="card-row">
                <i class="fas fa-map-marker-alt ${iconClass}"></i>
                <div><div class="row-label">Location</div><div class="row-val">${escapeHtml(r.location || '—')}</div></div>
            </div>
            <div class="card-row">
                <i class="fas fa-comment-alt ${iconClass}"></i>
                <div><div class="row-label">Situation</div><div class="row-val">${escapeHtml(situationText)}</div></div>
            </div>
            <div class="card-row">
                <i class="fas fa-user ${iconClass}"></i>
                <div><div class="row-label">Reporter</div><div class="row-val">${ownerName}</div></div>
            </div>
            <div class="card-row">
                <i class="fas fa-clock ${iconClass}"></i>
                <div><div class="row-label">Time Submitted</div><div class="row-val">${escapeHtml(formatSubmittedAt(r.timestamp))}</div></div>
            </div>`;

    const imageHtml = buildImageGallery(r.imageUrls);

    // Show responder status on own cards OR any card currently being responded to
    // (MyReports is a user-only page, so showing respond UI is always appropriate)
    const statusHtml = (isOwner || r.responderStatus === 'responding' || r.responderStatus === 'responded')
        ? buildResponderStatusHtml(r)
        : '';

    return `
            <div class="${cardClass}" data-id="${escapeHtml(r.id)}">
                <div class="card-top" style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="user-badge ${isOwner ? 'badge-you' : 'badge-other'}">${isHelp ? 'Help Request' : 'Flood Report'}</span>
                    <div style="display:flex; gap:8px;">
                        ${locationBtn}
                        ${deleteBtn}
                    </div>
                </div>
                <div class="${dividerClass}"></div>
                ${imageHtml}
                ${rows}
                ${statusHtml}
            </div>`;
}

// ─── Main render ──────────────────────────────────────────────────────────
async function renderList() {
    const queryStr = searchInput ? searchInput.value.toLowerCase() : '';

    // Show loading only on very first load
    if (allItems.length === 0) {
        reportsList.innerHTML = '<div style="text-align:center;padding:20px;color:#aaa;">Loading...</div>';
        return;
    }

    let items = [...allItems];
    await enrichReportNames(items);

    if (currentFilter === 'flood') items = items.filter(i => i.type === 'flood');
    if (currentFilter === 'help')  items = items.filter(i => i.type === 'help');

    if (queryStr) {
        items = items.filter(r => {
            const searchable = [
                r.location    || '',
                r.name        || '',
                r.description || '',
                r.details     || '',
                r.submittedBy || ''
            ].join(' ').toLowerCase();
            return searchable.includes(queryStr);
        });
    }

    items.sort((a, b) => {
        const dateA = toDate(a.timestamp) || new Date(0);
        const dateB = toDate(b.timestamp) || new Date(0);
        return dateB - dateA;
    });

    syncReportImagesToCarousel(items);

    if (items.length === 0) {
        reportsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon"><i class="fas fa-search"></i></div>
                    <div class="empty-title">No Reports Found</div>
                    <div class="empty-sub">No reports match your current filter or search.</div>
                </div>`;
        return;
    }

    let html = `<div class="list-count">${items.length} Report${items.length !== 1 ? 's' : ''}</div>`;
    html += items.map(buildCard).join('');
    html += '<div style="height:14px;"></div>';

    reportsList.innerHTML = html;

    // Attach delete button listeners
    reportsList.querySelectorAll('.card-delete-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const id      = btn.getAttribute('data-id');
            const isFlood = btn.getAttribute('data-isflood') === 'true';
            const cardEl  = btn.closest('.report-card');
            showConfirm(id, isFlood, cardEl);
        });
    });
}

// ─── Expose globals ───────────────────────────────────────────────────────
window.navigateTo        = navigateTo;
window.setFilter         = setFilter;
window.openImagePreview  = openImagePreview;
window.closeImagePreview = closeImagePreview;
window.openMapPreview    = openMapPreview;
window.closeMapPreview   = closeMapPreview;

// ─── Sync report images → homepage carousel ───────────────────────────────
function syncReportImagesToCarousel(items) {
    try {
        const CAROUSEL_REPORT_KEY = 'tabang_carousel_report_images';
        const allUrls = items
            .flatMap(item => Array.isArray(item.imageUrls) ? item.imageUrls : [])
            .filter(url => typeof url === 'string' && url.trim() !== '');
        const unique = [...new Set(allUrls)];
        localStorage.setItem(CAROUSEL_REPORT_KEY, JSON.stringify(unique));
    } catch (err) {
        console.warn('Could not sync report images to carousel:', err);
    }
}
