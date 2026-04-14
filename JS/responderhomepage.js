import { db, auth } from "./firebase.js";
import {
    collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
    onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
        try {
            const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
            const snap = await getDoc(doc(db, 'responders', user.uid));
            if (snap.exists()) {
                const d = snap.data();
                const name = d.fullName || d.name || user.displayName || 'Responder';
                document.getElementById('accName').textContent   = name;
                document.getElementById('accEmail').textContent  = d.email || user.email || '—';
                document.getElementById('accPhone').textContent  = d.phone || d.contactNumber || '—';
                document.getElementById('accId').textContent     = d.responderId || user.uid.slice(0,8).toUpperCase();
                document.getElementById('accUnit').textContent   = d.unit || d.agency || 'MDRRMO Numancia';
                document.getElementById('accUnit2').textContent  = d.unit || d.agency || 'MDRRMO Numancia';
                document.getElementById('accArea').textContent   = d.area || d.barangay || 'Numancia, Aklan';
                document.getElementById('accStatus').textContent = d.status || 'Active';
                if (d.createdAt) {
                    const dt = d.createdAt.toDate ? d.createdAt.toDate() : new Date(d.createdAt);
                    document.getElementById('accSince').textContent = dt.toLocaleDateString('en-US', { year:'numeric', month:'long' });
                }
            } else {
                document.getElementById('accName').textContent  = user.displayName || user.email || 'Responder';
                document.getElementById('accEmail').textContent = user.email || '—';
                document.getElementById('accId').textContent    = user.uid.slice(0,8).toUpperCase();
            }
        } catch (e) {
            document.getElementById('accName').textContent  = user.displayName || 'Responder';
            document.getElementById('accEmail').textContent = user.email || '—';
        }
    }
});

// ─── Time Ago Helper ──────────────────────────────────────────────

function timeAgo(ts) {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Math.floor((Date.now() - d) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
}

// ─── Sign Out ─────────────────────────────────────────────────────

window.handleSignOut = async function() {
    try {
        await signOut(auth);
        window.location.href = 'Login.html';
    } catch(e) { alert('Sign out failed: ' + e.message); }
};

// ─── Map with Status-Based Colored Markers ────────────────────────

function getStatusColor(status) {
    switch (status?.toLowerCase()) {
        case 'responding': return '#f59e0b'; // yellow/amber
        case 'resolved':   return '#10b981'; // green
        default:           return '#ef4444'; // unresolved (red)
    }
}

function getStatusIconName(type) {
    return type === 'flood' ? 'fa-water' : 'fa-circle-exclamation';
}

function createStatusIcon(status, reportType) {
    const color = getStatusColor(status);
    const iconClass = getStatusIconName(reportType);
    const html = `
        <div style="
            background-color: ${color};
            width: 30px;
            height: 30px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid white;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            font-size: 14px;
            color: white;
        ">
            <i class="fas ${iconClass}"></i>
        </div>
    `;
    return L.divIcon({
        html: html,
        className: 'custom-marker',
        iconSize: [30, 30],
        popupAnchor: [0, -12]
    });
}

window.initMap = function() {
    const mapEl = document.getElementById('incidentMap');
    if (!mapEl) return;

    const map = L.map(mapEl).setView([12.8797, 121.7740], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    let markers = [];

    async function updateMap() {
        try {
            // Remove existing markers
            markers.forEach(m => map.removeLayer(m));
            markers = [];

            let unresolved = 0, responding = 0, resolved = 0;

            const [floodSnap, helpSnap] = await Promise.all([
                getDocs(collection(db, 'floodReports')),
                getDocs(collection(db, 'helpRequests'))
            ]);

            // Process flood reports
            floodSnap.forEach(docSnap => {
                const data = docSnap.data();
                const status = data.status || 'unresolved';
                if (status === 'unresolved') unresolved++;
                else if (status === 'responding') responding++;
                else if (status === 'resolved') resolved++;

                if (data.latitude && data.longitude) {
                    const icon = createStatusIcon(status, 'flood');
                    const m = L.marker([data.latitude, data.longitude], { icon })
                        .addTo(map)
                        .bindPopup(`
                            <div style="font-size:12px;font-family:Inter,sans-serif;">
                                <strong>Flood Report</strong><br>
                                <b>Location:</b> ${data.location || 'Unknown'}<br>
                                <b>Details:</b> ${data.details || data.description || 'No details'}<br>
                                <b>Status:</b> ${status}<br>
                                <b>Reported:</b> ${timeAgo(data.timestamp)}<br>
                                <button onclick="window.location.href='AllReports.html'" style="margin-top:6px;padding:4px 10px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;font-size:11px;">View Details</button>
                            </div>
                        `);
                    markers.push(m);
                }
            });

            // Process help requests
            helpSnap.forEach(docSnap => {
                const data = docSnap.data();
                const status = data.status || 'unresolved';
                if (status === 'unresolved') unresolved++;
                else if (status === 'responding') responding++;
                else if (status === 'resolved') resolved++;

                if (data.latitude && data.longitude) {
                    const icon = createStatusIcon(status, 'help');
                    const m = L.marker([data.latitude, data.longitude], { icon })
                        .addTo(map)
                        .bindPopup(`
                            <div style="font-size:12px;font-family:Inter,sans-serif;">
                                <strong>Help Request</strong><br>
                                <b>Name:</b> ${data.name || 'Unknown'}<br>
                                <b>Situation:</b> ${data.description || 'No details'}<br>
                                <b>Phone:</b> ${data.phone || 'N/A'}<br>
                                <b>Status:</b> ${status}<br>
                                <b>Reported:</b> ${timeAgo(data.timestamp)}<br>
                                <button onclick="window.location.href='AllReports.html'" style="margin-top:6px;padding:4px 10px;background:#4ade80;color:#052e16;border:none;border-radius:6px;cursor:pointer;font-size:11px;">View Details</button>
                            </div>
                        `);
                    markers.push(m);
                }
            });

            // Adjust map view to fit all markers
            if (markers.length > 0) {
                const group = new L.featureGroup(markers);
                map.fitBounds(group.getBounds().pad(0.1));
            }

            // Update stats counters
            document.getElementById('unresolvedCount').textContent = unresolved;
            document.getElementById('respondingCount').textContent = responding;
            document.getElementById('resolvedCount').textContent   = resolved;

        } catch (error) {
            console.error('Error updating map:', error);
        }
    }

    updateMap();
    setInterval(updateMap, 30000);
};

// ─── Tab Switching & Navigation ───────────────────────────────────

const tabMap = {
    viewHome:     'navReports',
    viewHotlines: 'navHotlines',
    viewAccount:  'navAccount'
};

window.switchTab = function(panelId) {
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add('active');
    const navId = tabMap[panelId];
    if (navId) document.getElementById(navId)?.classList.add('active');
};

window.goHotlines = function() {
    window.location.href = 'responderhotline.html';
};

window.openImgPreview = function(url) {
    document.getElementById('imgPreviewEl').src = url;
    document.getElementById('imgPreviewOverlay').classList.add('open');
};

window.closeImgPreview = function() {
    document.getElementById('imgPreviewOverlay').classList.remove('open');
};

window.callPerson = function(phone) {
    if (phone && phone !== '—' && phone.trim() !== '') {
        window.location.href = 'tel:' + phone;
    }
};

window.addEventListener('DOMContentLoaded', function() {
    const hash = window.location.hash.replace('#', '');
    if (hash && document.getElementById(hash)) {
        window.switchTab(hash);
    }
    setTimeout(function() {
        if (typeof window.initMap === 'function' && document.getElementById('incidentMap')) {
            window.initMap();
        }
    }, 300);
});