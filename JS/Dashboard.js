// Dashboard.js — Flood response + Help requests + Evacuation centers (Aklan only)

(function () {

    function getRequesterName(data) {
        return data.submittedBy || data.name || 'Anonymous';
    }

    // ----- Static fallback data (Aklan only, used when Firebase collections are empty) -----
    const staticFloods = [
        { name: 'Flood — Kalibo',   lat: 11.710, lng: 122.364, detail: 'Sample flood report' },
        { name: 'Flood — Numancia', lat: 11.705, lng: 122.330, detail: 'Sample flood report' }
    ];

    const staticHelp = [
        { name: 'Help: Family stranded', lat: 11.715, lng: 122.368, detail: 'Need rescue', phone: '09123456789' }
    ];

    const staticEvacs = [
        { name: 'Evacuation Center — Kalibo', lat: 11.702, lng: 122.370, detail: 'Capacity: 300 families', phone: '09271234567' },
        { name: 'Evacuation Center — Numancia', lat: 11.700, lng: 122.328, detail: 'Capacity: 200 families', phone: '09271234568' }
    ];

    // Status‑based colors for flood reports and help requests
    function getStatusColor(status) {
        switch (status?.toLowerCase()) {
            case 'responding': return '#f59e0b'; // yellow
            case 'resolved':   return '#10b981'; // green
            default:           return '#ef4444'; // unresolved (red)
        }
    }

    // Create a colored marker with Font Awesome icon
    function createMarker(color, iconClass, popupContent) {
        const html = `
            <div style="
                background-color: ${color};
                width: 34px;
                height: 34px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 2px solid white;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                font-size: 16px;
                color: white;
            ">
                <i class="fas ${iconClass}"></i>
            </div>
        `;
        const icon = L.divIcon({
            html: html,
            className: 'custom-marker',
            iconSize: [34, 34],
            popupAnchor: [0, -12]
        });
        return L.marker([0,0], { icon }).bindPopup(popupContent);
    }

    function addMarkersToMap(map, markersLayer, floodHelpItems, evacItems) {
        markersLayer.clearLayers();

        // Add flood/help markers (status‑based)
        floodHelpItems.forEach(item => {
            const color = getStatusColor(item.status);
            const iconClass = item.type === 'flood' ? 'fa-water' : 'fa-circle-exclamation';
            const popupContent = `
                <div style="font-size:12px;font-family:Inter,sans-serif;">
                    <strong>${item.name}</strong><br>
                    <b>Details:</b> ${item.detail}<br>
                    <b>Status:</b> ${item.status}<br>
                    ${item.locationText ? `<b>Location:</b> ${item.locationText}<br>` : ''}
                    ${item.phone ? `<b>Phone:</b> ${item.phone}<br>` : ''}
                    ${item.ts ? `<small>📅 ${item.ts}</small><br>` : ''}
                    ${item.img ? `<a href="${item.img}" target="_blank">📷 View image</a>` : ''}
                </div>
            `;
            const marker = createMarker(color, iconClass, popupContent);
            marker.setLatLng([item.lat, item.lng]);
            marker.addTo(markersLayer);
        });

        // Add evacuation center markers (always green, no status)
        evacItems.forEach(evac => {
            const color = '#4caf7d';
            const iconClass = 'fa-people-arrows';
            const popupContent = `
                <div style="font-size:12px;font-family:Inter,sans-serif;">
                    <strong>${evac.name}</strong><br>
                    ${evac.detail}<br>
                    ${evac.phone ? `📞 ${evac.phone}` : ''}
                </div>
            `;
            const marker = createMarker(color, iconClass, popupContent);
            marker.setLatLng([evac.lat, evac.lng]);
            marker.addTo(markersLayer);
        });
    }

    function initMap() {
        const container = document.getElementById('dashMap');
        const loadingEl = document.getElementById('dashMapLoading');
        if (!container) return;

        const map = L.map('dashMap').setView([11.71, 122.37], 11); // centered on Kalibo, Aklan
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(map);

        const markersLayer = L.layerGroup().addTo(map);

        // Show fallback data immediately (flood/help + evac centers)
        const initialFloodHelp = [
            ...staticFloods.map(f => ({ ...f, type: 'flood', status: 'unresolved' })),
            ...staticHelp.map(h => ({ ...h, type: 'help', status: 'unresolved' }))
        ];
        addMarkersToMap(map, markersLayer, initialFloodHelp, staticEvacs);

        setTimeout(() => {
            map.invalidateSize();
            if (loadingEl) loadingEl.style.display = 'none';
        }, 200);

        loadFirebaseData(map, markersLayer);

        window.addEventListener('resize', () => {
            setTimeout(() => map.invalidateSize(), 150);
        });
    }

    async function loadFirebaseData(map, markersLayer) {
        try {
            const db = window._tabangDb;
            if (!db) return;

            const { collection, getDocs } = window._firestoreFns;

            // 1. Load flood reports and help requests
            const [floodSnap, helpSnap] = await Promise.all([
                getDocs(collection(db, 'floodReports')),
                getDocs(collection(db, 'helpRequests'))
            ]);

            const dynamicFloodHelp = [];

            floodSnap.forEach(doc => {
                const d = doc.data();
                if (d.latitude && d.longitude) {
                    dynamicFloodHelp.push({
                        name: `Flood: ${d.submittedBy || 'Anonymous'}`,
                        lat: d.latitude,
                        lng: d.longitude,
                        status: d.status || 'unresolved',
                        type: 'flood',
                        detail: d.details || d.description || 'No details',
                        locationText: d.location || '',
                        img: d.imageUrls?.[0] || '',
                        phone: d.phone || '',
                        ts: d.timestamp?.toDate?.().toLocaleString() || ''
                    });
                }
            });

            helpSnap.forEach(doc => {
                const d = doc.data();
                if (d.latitude && d.longitude) {
                    dynamicFloodHelp.push({
                        name: `Help: ${getRequesterName(d)}`,
                        lat: d.latitude,
                        lng: d.longitude,
                        status: d.status || 'unresolved',
                        type: 'help',
                        detail: d.description || 'No description',
                        locationText: d.location || '',
                        img: d.imageUrls?.[0] || '',
                        phone: d.phone || '',
                        ts: d.timestamp?.toDate?.().toLocaleString() || ''
                    });
                }
            });

            // 2. Load evacuation centers (if collection exists)
            let dynamicEvacs = [];
            try {
                const evacSnap = await getDocs(collection(db, 'evacuationCenters'));
                evacSnap.forEach(doc => {
                    const d = doc.data();
                    if (d.latitude && d.longitude) {
                        dynamicEvacs.push({
                            name: d.name || 'Evacuation Center',
                            lat: d.latitude,
                            lng: d.longitude,
                            detail: d.detail || d.description || 'No details',
                            phone: d.phone || ''
                        });
                    }
                });
            } catch (e) {
                console.warn('evacuationCenters collection not found or empty, using static fallback');
            }

            // Use dynamic data if available, otherwise fallback
            const finalFloodHelp = dynamicFloodHelp.length > 0 ? dynamicFloodHelp : staticFloods.map(f => ({ ...f, type: 'flood', status: 'unresolved' })).concat(staticHelp.map(h => ({ ...h, type: 'help', status: 'unresolved' })));
            const finalEvacs = dynamicEvacs.length > 0 ? dynamicEvacs : staticEvacs;

            addMarkersToMap(map, markersLayer, finalFloodHelp, finalEvacs);

        } catch (err) {
            console.warn('Firebase data not fully loaded, using static fallback:', err.message);
            // Ensure evac centers still show even if Firebase fails completely
            const fallbackFloodHelp = staticFloods.map(f => ({ ...f, type: 'flood', status: 'unresolved' })).concat(staticHelp.map(h => ({ ...h, type: 'help', status: 'unresolved' })));
            addMarkersToMap(map, markersLayer, fallbackFloodHelp, staticEvacs);
        }
    }

    if (document.readyState === 'complete') {
        initMap();
    } else {
        window.addEventListener('load', initMap);
    }
})();
