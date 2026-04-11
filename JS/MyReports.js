// Firebase imports: auth, database instance, email sign-in helper, and Firestore doc helpers
import { db, auth } from "../javascript/firebase.js";
import { collection, getDocs, deleteDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── State ───────────────────────────────────────────────────────────────
let currentFilter = 'all';
let pendingDelete = null;
let currentUser = null;
let previewMap = null;
let previewMarker = null;

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

// ─── Map preview functions ───────────────────────────────────────────────
function openMapPreview(lat, lng, title) {
    // Show modal
    mapModal.style.display = 'flex';
    // Wait for modal to be visible, then init map
    setTimeout(() => {
        const container = document.getElementById('previewMap');
        if (!container) return;
        // Destroy previous map instance if exists
        if (previewMap) {
            previewMap.remove();
            previewMap = null;
        }
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
    if (previewMap) {
        previewMap.remove();
        previewMap = null;
    }
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
    renderList();
});

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
    renderList();
}

// ─── Data fetching ────────────────────────────────────────────────────────
async function getAllFloodReports() {
    const snap = await getDocs(collection(db, 'floodReports'));
    return snap.docs.map(d => ({ ...d.data(), id: d.id, type: 'flood' }));
}

async function getAllHelpRequests() {
    const snap = await getDocs(collection(db, 'helpRequests'));
    return snap.docs.map(d => ({ ...d.data(), id: d.id, type: 'help' }));
}

async function enrichReportNames(items) {
    const cache = new Map();
    const promises = items.map(async item => {
        if (!item.userId) return;
        if (cache.has(item.userId)) {
            item.reporterName = cache.get(item.userId);
            return;
        }
        try {
            const userRef = doc(db, 'users', item.userId);
            const userSnap = await getDoc(userRef);
            let name = null;
            if (userSnap.exists()) {
                const data = userSnap.data();
                name = data.name || data.fullName || data.displayName || null;
            }
            if (!name) {
                const responderRef = doc(db, 'responders', item.userId);
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

// ─── Build a single card's HTML ───────────────────────────────────────────
function buildCard(r) {
    const isHelp    = r.type === 'help';
    const isOwner   = currentUser && r.userId === currentUser.uid;
    const hasCoords = r.latitude && r.longitude;

    const cardClass   = `report-card${isHelp ? ' help-card' : ''}`;
    const dividerClass = isHelp ? 'card-divider help-divider' : 'card-divider';
    const iconClass   = isHelp ? 'row-icon help-row-icon' : 'row-icon';

    // Type badge
    const badgeHtml = isHelp
        ? '<span class="badge badge-emergency"><i class="fas fa-ambulance"></i> Emergency Request</span>'
        : '<span class="badge badge-priority"><i class="fas fa-flag"></i> Flood Report</span>';

    // Owner badge
    const ownerName       = escapeHtml(r.reporterName || r.name || r.submittedBy || 'Unknown');
    const ownerDetail     = escapeHtml(r.submittedBy || r.email || '');
    const ownerBadgeClass = isOwner ? 'badge-you' : 'badge-other';
    const ownerBadge      = `<span class="user-badge ${ownerBadgeClass}"><i class="fas fa-user"></i> ${ownerName}</span>`;

    // Delete button (only for own entries)
    const deleteBtn = isOwner
        ? `<button class="card-delete-btn"
                       data-id="${escapeHtml(r.id)}"
                       data-isflood="${r.type === 'flood'}"
                       title="Delete">
                   <i class="fas fa-trash-alt"></i>
               </button>`
        : '';

    // Location button (if coordinates exist)
    let locationBtn = '';
    if (hasCoords) {
        const lat = r.latitude;
        const lng = r.longitude;
        const title = isHelp ? `Help request by ${escapeHtml(r.name || r.submittedBy || 'Anonymous')}` : `Flood report at ${escapeHtml(r.location || 'unknown location')}`;
        locationBtn = `<button class="card-location-btn" onclick="openMapPreview(${lat}, ${lng}, '${escapeHtml(title)}')">
                               <i class="fas fa-map-marker-alt"></i> View on map
                           </button>`;
    }

    // Content rows
    let rows = '';
    if (isHelp) {
        rows = `
                <div class="card-row">
                    <i class="fas fa-user ${iconClass}"></i>
                    <div><div class="row-label">Name</div><div class="row-val">${escapeHtml(r.name || '—')}</div></div>
                </div>
                <div class="card-row">
                    <i class="fas fa-phone ${iconClass}"></i>
                    <div><div class="row-label">Phone</div><div class="row-val">${escapeHtml(r.phone || '—')}</div></div>
                </div>
                <div class="card-row">
                    <i class="fas fa-comment-alt ${iconClass}"></i>
                    <div><div class="row-label">Situation</div><div class="row-val">${escapeHtml(r.description || '—')}</div></div>
                </div>`;
    } else {
        rows = `
                <div class="card-row">
                    <i class="fas fa-map-marker-alt ${iconClass}"></i>
                    <div><div class="row-label">Location</div><div class="row-val">${escapeHtml(r.location || '—')}</div></div>
                </div>
                ${r.details ? `
                <div class="card-row">
                    <i class="fas fa-info-circle ${iconClass}"></i>
                    <div><div class="row-label">Details</div><div class="row-val">${escapeHtml(r.details)}</div></div>
                </div>` : ''}`;
    }

    // Timestamp row (common)
    rows += `
            <div class="card-row">
                <i class="fas fa-user ${iconClass}"></i>
                <div><div class="row-label">Reporter</div><div class="row-val">${ownerName}${ownerDetail ? ` (${ownerDetail})` : ''}</div></div>
            </div>
            <div class="card-row">
                <i class="fas fa-clock ${iconClass}"></i>
                <div><div class="row-label">Submitted</div><div class="row-val">${escapeHtml(formatDate(r.timestamp))}</div></div>
            </div>`;

    const imageHtml = buildImageGallery(r.imageUrls);

    return `
            <div class="${cardClass}" data-id="${escapeHtml(r.id)}">
                <div class="card-top" style="display:flex; justify-content:space-between; align-items:center;">
                    ${ownerBadge}
                    <div style="display:flex; gap:8px;">
                        ${locationBtn}
                        ${deleteBtn}
                    </div>
                </div>
                <div class="${dividerClass}"></div>
                ${imageHtml}
                ${rows}
                <div class="card-footer">
                    ${badgeHtml}
                    <span class="card-assigned"><i class="fas fa-shield-alt"></i> MDRRMO Aklan</span>
                </div>
            </div>`;
}

// ─── Main render ──────────────────────────────────────────────────────────
async function renderList() {
    const queryStr = searchInput.value.toLowerCase();
    reportsList.innerHTML = '<div style="text-align:center;padding:20px;color:#aaa;">Loading...</div>';

    const [floods, helps] = await Promise.all([getAllFloodReports(), getAllHelpRequests()]);
    let items = [...floods, ...helps];
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

// ─── Expose globals for inline onclick handlers ───────────────────────────
window.navigateTo       = navigateTo;
window.setFilter        = setFilter;
window.openImagePreview = openImagePreview;
window.closeImagePreview = closeImagePreview;
window.openMapPreview   = openMapPreview;
window.closeMapPreview  = closeMapPreview;