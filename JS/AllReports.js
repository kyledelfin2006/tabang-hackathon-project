// Firebase imports: database, auth instance, Firestore doc helpers, and auth state/sign-out
import { db, auth } from '../javascript/firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Tracks the currently authenticated Firebase user
let currentUser = null;

// Tracks the active report filter: 'all', 'flood', or 'help'
let repFilter = 'all';

// Redirect to login if no user is authenticated; otherwise store the user and load reports
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    currentUser = user;
    renderFloodReports();
});

// Updates the active filter pill and re-renders the report list based on the selected filter
function setRepFilter(filter, btn) {
    repFilter = filter;
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderFloodReports();
}

// Expose to global scope so it can be called from inline HTML onclick attributes
window.setRepFilter = setRepFilter;

// ─── Image preview ────────────────────────────────────────────────────────────
// Opens the full-screen image preview modal with the given image URL
function openImagePreview(src) {
    const modal = document.getElementById('imagePreview');
    const img   = document.getElementById('previewImg');
    if (!modal || !img) return;
    img.src = src;
    img.classList.remove('zoomed');
    modal.style.display = 'flex';
}

// Closes the full-screen image preview modal
function closeImagePreview() {
    const modal = document.getElementById('imagePreview');
    if (modal) modal.style.display = 'none';
}

// Expose image preview functions globally for inline onclick handlers
window.openImagePreview  = openImagePreview;
window.closeImagePreview = closeImagePreview;

// Toggle zoom on the preview image when clicked
document.addEventListener('DOMContentLoaded', () => {
    const previewImg = document.getElementById('previewImg');
    if (previewImg) {
        previewImg.addEventListener('click', function () {
            this.classList.toggle('zoomed');
        });
    }
});

// ─── Build image gallery HTML ─────────────────────────────────────────────────
// Renders up to 4 thumbnail images from the report's imageUrls array.
// Shows a "+N" label if there are more than 4 images.
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

// Fetches flood reports and help requests from Firestore, applies filters/search/sort, and renders cards
async function renderFloodReports() {
    const container = document.getElementById('reportsList');
    if (!container) return;

    // Show a loading spinner while data is being fetched
    container.innerHTML = '<div class="panel-loading"><i class="fas fa-circle-notch fa-spin"></i> Loading...</div>';

    try {
        // Fetch both collections in parallel for efficiency
        const [fSnap, hSnap] = await Promise.all([
            getDocs(collection(db, 'floodReports')),
            getDocs(collection(db, 'helpRequests'))
        ]);

        // Map Firestore documents to plain objects and tag each with its type
        let floods = fSnap.docs.map(d => ({ ...d.data(), id: d.id, type: 'flood' }));
        let helps  = hSnap.docs.map(d => ({ ...d.data(), id: d.id, type: 'help' }));

        // Apply the active filter: show only floods, only help requests, or both
        let items = repFilter === 'flood' ? floods : repFilter === 'help' ? helps : [...floods, ...helps];

        // Apply the search query filter if the search box has a value
        const q = (document.getElementById('repSearch')?.value || '').toLowerCase();
        if (q) items = items.filter(r =>
            (r.location + r.name + r.description + r.details + r.submittedBy).toLowerCase().includes(q)
        );

        // Sort reports by timestamp descending (newest first)
        items.sort((a, b) => {
            const ta = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
            const tb = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
            return tb - ta;
        });

        // Show an empty state message if no reports match the current filters
        if (!items.length) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-water"></i></div><div class="empty-title">No Reports</div><div class="empty-sub">No matching reports found.</div></div>`;
            return;
        }

        // Render the report count header and a card for each report
        container.innerHTML =
            `<div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.8px;">
                ${items.length} Report${items.length !== 1 ? 's' : ''}
            </div>` +
            items.map(r => {
                const isHelp = r.type === 'help';

                // Build the middle card rows differently depending on report type
                const rows = isHelp
                    ? `<div class="card-row"><i class="fas fa-map-marker-alt row-icon"></i><div><div class="row-label">Location</div><div class="row-val">${escHtml(r.location)}</div></div></div>
                       <div class="card-row"><i class="fas fa-comment-alt row-icon"></i><div><div class="row-label">Situation</div><div class="row-val">${escHtml(r.description)}</div></div></div>`
                    : `<div class="card-row"><i class="fas fa-map-marker-alt row-icon"></i><div><div class="row-label">Location</div><div class="row-val">${escHtml(r.location)}</div></div></div>
                       ${r.details ? `<div class="card-row"><i class="fas fa-info-circle row-icon"></i><div><div class="row-label">Details</div><div class="row-val">${escHtml(r.details)}</div></div></div>` : ''}`;

                const submittedByName = isHelp ? (r.name || r.submittedBy) : r.submittedBy;

                // Build the image gallery if the report has attached images
                const imageHtml = buildImageGallery(r.imageUrls);

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
                    </div>`;
            }).join('') + '<div style="height:12px;"></div>';

    } catch (e) {
        // Display an error card if the Firestore fetch fails
        container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-exclamation-circle"></i></div><div class="empty-title">Error Loading</div><div class="empty-sub">${e.message}</div></div>`;
    }
}

// Converts a Firestore timestamp to a human-readable relative time string (e.g. "5m ago")
function timeAgo(timestamp) {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs    = now - date;
    const diffMins  = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays  = Math.floor(diffHours / 24);

    if (diffMins < 1)  return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
}

// Formats a Firestore timestamp into a full locale date/time string
function fmtDate(timestamp) {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
}

// Escapes HTML special characters to prevent XSS when rendering user-submitted content
function escHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Extracts a readable display name from an email address or returns the value as-is
function getDisplayName(submittedBy) {
    if (!submittedBy) return 'Unknown';
    if (submittedBy.includes('@')) {
        return submittedBy.split('@')[0];
    }
    return submittedBy;
}

// Expose renderFloodReports globally so the search input oninput can call it
window.renderFloodReports = renderFloodReports;

// Dummy viewReport function if needed elsewhere
window.viewReport = function(reportId) {
    console.log('View report:', reportId);
};