// Firebase imports: database, auth instance, Firestore doc helpers, and auth state/sign-out
import { db, auth } from '../javascript/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
    collection, doc, updateDoc,
    onSnapshot, query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Tracks the currently authenticated Firebase user
let currentUser = null;

// Tracks the active report filter: 'all', 'flood', or 'help'
let repFilter = 'all';

// In-memory cache of all fetched items (kept fresh by onSnapshot)
let allItems = [];

// Active Firestore listeners — unsubscribe when re-attaching
let unsubFlood = null;
let unsubHelp  = null;

function getRequesterName(report) {
    return report.reporterName || report.submittedBy || report.name || 'Unknown';
}

// Redirect to login if no user is authenticated; otherwise store the user and start listeners
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    currentUser = user;
    attachListeners();
});

// ─── Real-time Firestore listeners ────────────────────────────────────────────
// Uses onSnapshot so AllReports automatically reflects changes made by the user
// side (MyReports) in real-time — specifically when responderStatus → 'responded'.
function attachListeners() {
    // Clean up any previous listeners
    if (unsubFlood) unsubFlood();
    if (unsubHelp)  unsubHelp();

    let floodItems = [];
    let helpItems  = [];

    const merge = () => {
        allItems = [...floodItems, ...helpItems];
        renderFloodReports();
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

// Updates the active filter pill and re-renders the report list
function setRepFilter(filter, btn) {
    repFilter = filter;
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderFloodReports();
}
window.setRepFilter = setRepFilter;

// ─── Image preview ────────────────────────────────────────────────────────────
function openImagePreview(src) {
    const modal = document.getElementById('imagePreview');
    const img   = document.getElementById('previewImg');
    if (!modal || !img) return;
    img.src = src;
    img.classList.remove('zoomed');
    modal.style.display = 'flex';
}

function closeImagePreview() {
    const modal = document.getElementById('imagePreview');
    if (modal) modal.style.display = 'none';
}

window.openImagePreview  = openImagePreview;
window.closeImagePreview = closeImagePreview;

document.addEventListener('DOMContentLoaded', () => {
    const previewImg = document.getElementById('previewImg');
    if (previewImg) {
        previewImg.addEventListener('click', function () {
            this.classList.toggle('zoomed');
        });
    }
});

// ─── Build image gallery HTML ─────────────────────────────────────────────────
function buildImageGallery(imageUrls) {
    if (!imageUrls || imageUrls.length === 0) return '';
    const maxVisible    = 4;
    const visibleImages = imageUrls.slice(0, maxVisible);
    const extraCount    = imageUrls.length - maxVisible;
    const thumbnails = visibleImages.map(url => `
        <img class="gallery-thumb"
             src="${escHtml(url)}"
             alt="Report image"
             loading="lazy"
             onclick="openImagePreview('${escHtml(url)}')">`
    ).join('');
    const moreLabel = extraCount > 0 ? `<div class="gallery-more">+${extraCount}</div>` : '';
    return `<div class="image-gallery">${thumbnails}${moreLabel}</div>`;
}

// ─── Respond Button ───────────────────────────────────────────────────────────
//
// States visible to the RESPONDER:
//   'respond'    → red   "Respond" button       → clicking sets status to 'responding'
//   'responding' → amber "Responding…" spinner  → LOCKED, waits for user to click
//                                                  "Mark as Responded" on MyReports
//   'responded'  → green "Responded ✓"          → read-only, set by the user side only
//
function getStatusConfig(status) {
    switch (status) {
        case 'responding':
            return {
                label:    '<i class="fas fa-spinner fa-spin"></i> Responding…',
                cls:      'btn-responding',
                disabled: true,   // Locked — waits for the user to confirm
                title:    'Waiting for the reporter to confirm as Responded'
            };
        case 'responded':
            return {
                label:    '<i class="fas fa-check-circle"></i> Responded',
                cls:      'btn-responded',
                disabled: true,
                title:    'This report has been resolved — confirmed by the reporter'
            };
        default: // 'respond'
            return {
                label:    '<i class="fas fa-bolt"></i> Respond',
                cls:      'btn-respond',
                disabled: false,
                title:    'Click to start responding to this report'
            };
    }
}

// Only 'respond' → 'responding' is allowed here. The rest is driven by Firestore.
async function cycleRespondStatus(reportId, reportType, btn) {
    const currentStatus = btn.getAttribute('data-status') || 'respond';

    // Responders can ONLY move from 'respond' → 'responding'.
    // 'responding' → 'responded' is exclusively the user's action in MyReports.
    if (currentStatus !== 'respond') return;

    const nextStatus = 'responding';

    // Optimistically lock the button immediately
    applyStatusToBtn(btn, nextStatus);

    try {
        const collectionName = reportType === 'help' ? 'helpRequests' : 'floodReports';
        await updateDoc(doc(db, collectionName, reportId), {
            responderStatus: nextStatus
        });
    } catch (err) {
        console.error('Failed to update status:', err);
        // Roll back on failure
        applyStatusToBtn(btn, currentStatus);
    }
}

function applyStatusToBtn(btn, status) {
    const config = getStatusConfig(status);
    btn.setAttribute('data-status', status);
    btn.innerHTML  = config.label;
    btn.disabled   = config.disabled;
    btn.title      = config.title || '';
    btn.classList.remove('btn-respond', 'btn-responding', 'btn-responded');
    btn.classList.add(config.cls);
    // Visual cue: muted cursor when locked
    btn.style.cursor = config.disabled ? 'default' : 'pointer';
    // 'responded' — fully resolved, dim slightly and remove hover lift
    if (status === 'responded') {
        btn.style.opacity   = '0.85';
        btn.style.transform = 'none';
        btn.style.pointerEvents = 'none'; // stop any hover effects
    } else {
        btn.style.opacity   = '1';
        btn.style.pointerEvents = config.disabled ? 'none' : 'auto';
    }
}

window.cycleRespondStatus = cycleRespondStatus;

// ─── Render reports from in-memory cache ─────────────────────────────────────
function renderFloodReports() {
    const container = document.getElementById('reportsList');
    if (!container) return;

    // Show a brief loading state only on the very first load (cache is empty)
    if (allItems.length === 0) {
        container.innerHTML = '<div class="panel-loading"><i class="fas fa-circle-notch fa-spin"></i> Loading...</div>';
        return;
    }

    try {
        let items = repFilter === 'flood'
            ? allItems.filter(r => r.type === 'flood')
            : repFilter === 'help'
                ? allItems.filter(r => r.type === 'help')
                : [...allItems];

        const q = (document.getElementById('repSearch')?.value || '').toLowerCase();
        if (q) {
            items = items.filter(r =>
                (r.location + getRequesterName(r) + r.description + r.details + r.submittedBy)
                    .toLowerCase().includes(q)
            );
        }

        items.sort((a, b) => {
            const ta = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
            const tb = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
            return tb - ta;
        });

        if (!items.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon"><i class="fas fa-water"></i></div>
                    <div class="empty-title">No Reports</div>
                    <div class="empty-sub">No matching reports found.</div>
                </div>`;
            return;
        }

        container.innerHTML =
            `<div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.8px;">
                ${items.length} Report${items.length !== 1 ? 's' : ''}
            </div>` +
            items.map(r => {
                const isHelp = r.type === 'help';

                const rows = isHelp
                    ? `<div class="card-row"><i class="fas fa-map-marker-alt row-icon"></i><div><div class="row-label">Location</div><div class="row-val">${escHtml(r.location)}</div></div></div>
                       <div class="card-row"><i class="fas fa-comment-alt row-icon"></i><div><div class="row-label">Situation</div><div class="row-val">${escHtml(r.description)}</div></div></div>`
                    : `<div class="card-row"><i class="fas fa-map-marker-alt row-icon"></i><div><div class="row-label">Location</div><div class="row-val">${escHtml(r.location)}</div></div></div>
                       ${r.details ? `<div class="card-row"><i class="fas fa-info-circle row-icon"></i><div><div class="row-label">Details</div><div class="row-val">${escHtml(r.details)}</div></div></div>` : ''}`;

                const submittedByName = isHelp ? getRequesterName(r) : r.submittedBy;
                const imageHtml = buildImageGallery(r.imageUrls);

                // Use the actual Firestore status — all three states are rendered correctly
                const savedStatus = r.responderStatus || 'respond';
                const statusConfig = getStatusConfig(savedStatus);

                const respondBtn = `
                    <div class="card-actions">
                        <button class="respond-btn ${statusConfig.cls}"
                                data-status="${savedStatus}"
                                ${statusConfig.disabled ? 'disabled' : ''}
                                title="${escHtml(statusConfig.title || '')}"
                                style="cursor:${statusConfig.disabled ? 'default' : 'pointer'};${savedStatus === 'responded' ? 'opacity:0.85;pointer-events:none;' : ''}"
                                onclick="cycleRespondStatus('${escHtml(r.id)}', '${escHtml(r.type)}', this)">
                            ${statusConfig.label}
                        </button>
                    </div>`;

                return `
                    <div class="entry-card ${isHelp ? 'help-card' : 'flood-card'}">
                        <div class="card-top-row">
                            <span class="type-badge ${isHelp ? 'badge-help' : 'badge-flood'}">
                                ${isHelp ? '<i class="fas fa-ambulance"></i> Help Request' : '<i class="fas fa-water"></i> Flood Report'}
                            </span>
                            <span class="card-time">${timeAgo(r.timestamp)}</span>
                        </div>
                        <div class="card-row">
                            <i class="fas fa-user row-icon"></i>
                            <div><div class="row-label">Submitted By</div><div class="row-val">${escHtml(getDisplayName(submittedByName))}</div></div>
                        </div>
                        ${rows}
                        <div class="card-row">
                            <i class="fas fa-clock row-icon"></i>
                            <div><div class="row-label">Submitted</div><div class="row-val">${fmtDate(r.timestamp)}</div></div>
                        </div>
                        ${imageHtml}
                        ${respondBtn}
                    </div>`;
            }).join('') + '<div style="height:12px;"></div>';

    } catch (e) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i class="fas fa-exclamation-circle"></i></div>
                <div class="empty-title">Error Loading</div>
                <div class="empty-sub">${e.message}</div>
            </div>`;
    }
}

window.renderFloodReports = renderFloodReports;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(timestamp) {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs    = now - date;
    const diffMins  = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays  = Math.floor(diffHours / 24);

    if (diffMins < 1)   return 'Just now';
    if (diffMins < 60)  return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
}

function fmtDate(timestamp) {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
}

function escHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getDisplayName(submittedBy) {
    if (!submittedBy) return 'Unknown';
    if (submittedBy.includes('@')) return submittedBy.split('@')[0];
    return submittedBy;
}

window.viewReport = function(reportId) {
    console.log('View report:', reportId);
};
