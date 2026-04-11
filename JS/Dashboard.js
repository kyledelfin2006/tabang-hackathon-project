// Dashboard.js — plain script (not module), runs after Leaflet is loaded

(function () {

    // Static incident data
    const incidents = [
        {name:'Flood — Palo, Leyte',  lat:11.15, lng:124.99, type:'flood',   detail:'1,200 affected'},
        {name:'Flood — Ormoc City',   lat:11.00, lng:124.61, type:'flood',   detail:'Roads submerged'},
        {name:'Typhoon landfall',      lat:11.40, lng:125.10, type:'typhoon', detail:'Signal 3 · 4,200 affected'},
        {name:'Typhoon — Samar',       lat:11.65, lng:125.00, type:'typhoon', detail:'Coastal flooding'},
        {name:'Flood — Capiz',         lat:11.35, lng:122.63, type:'flood',   detail:'River 78% full'},
        {name:'Fire — Iloilo City',    lat:10.72, lng:122.57, type:'fire',    detail:'3 barangays hit'},
        {name:'Fire — Roxas City',     lat:11.59, lng:122.75, type:'fire',    detail:'Contained'},
        {name:'Earthquake — Negros',   lat:10.20, lng:122.98, type:'quake',   detail:'Magnitude 4.2'},
        {name:'Typhoon — Antique',     lat:11.00, lng:121.95, type:'typhoon', detail:'Gusts 95kph'},
        {name:'Flood — Aklan',         lat:11.82, lng:122.49, type:'flood',   detail:'Low-lying inundated'},
        {name:'Typhoon — Romblon',     lat:12.58, lng:122.27, type:'typhoon', detail:'Signal 2'},
        {name:'Flood — S. Leyte',      lat:10.30, lng:124.97, type:'flood',   detail:'600 displaced'},
        {name:'Evac — Iloilo',         lat:10.69, lng:122.55, type:'evac',    detail:'680 evacuees'},
        {name:'Evac — Ormoc',          lat:11.01, lng:124.59, type:'evac',    detail:'420 evacuees'},
        {name:'Evac — Kalibo',         lat:11.71, lng:122.37, type:'evac',    detail:'310 evacuees'},
        {name:'Earthquake — Cebu',     lat:10.31, lng:123.89, type:'quake',   detail:'Magnitude 3.8'},
        {name:'Fire — Bacolod',        lat:10.67, lng:122.95, type:'fire',    detail:'Controlled'},
        {name:'Typhoon — Mindoro',     lat:13.05, lng:121.12, type:'typhoon', detail:'Signal 1'},
    ];

    const aklanBounds = { minLat:11.3, maxLat:12.0, minLng:121.8, maxLng:122.6 };
    const aklanIncidents = incidents.filter(i =>
        i.lat >= aklanBounds.minLat && i.lat <= aklanBounds.maxLat &&
        i.lng >= aklanBounds.minLng && i.lng <= aklanBounds.maxLng
    );

    const cmap = {
        flood:'#378ADD', fire:'#EF9F27', quake:'#888780',
        typhoon:'#33b4a5', evac:'#4caf7d', user:'#ff8c42', help:'#aa66ff'
    };

    function addMarkersToMap(map, markersLayer, reports) {
        markersLayer.clearLayers();
        reports.forEach(inc => {
            const color  = cmap[inc.type] || '#888780';
            const radius = inc.type === 'typhoon' ? 10 : 8;
            let popup = `<strong>${inc.name}</strong><br>${inc.detail}`;
            if (inc.locationText) popup += `<br>📍 ${inc.locationText}`;
            if (inc.phone)        popup += `<br>📞 ${inc.phone}`;
            if (inc.ts)           popup += `<br><small>📅 ${inc.ts}</small>`;
            if (inc.img)          popup += `<br><a href="${inc.img}" target="_blank">📷 View image</a>`;

            L.circleMarker([inc.lat, inc.lng], {
                radius, fillColor: color,
                color: '#fff', weight: 1.5,
                opacity: 1, fillOpacity: 0.9
            }).bindPopup(popup).addTo(markersLayer);
        });
    }

    function initMap() {
        const container = document.getElementById('dashMap');
        const loadingEl = document.getElementById('dashMapLoading');
        if (!container) return;

        // Create map
        const map = L.map('dashMap').setView([11.6, 122.4], 9);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(map);

        const markersLayer = L.layerGroup().addTo(map);

        // Plot static markers immediately — no waiting for Firebase
        addMarkersToMap(map, markersLayer, aklanIncidents);

        // Hide loading spinner right after map renders
        setTimeout(() => {
            map.invalidateSize();
            if (loadingEl) loadingEl.style.display = 'none';
        }, 200);

        // Try to load Firebase data — but map already shows without it
        loadFirebaseData(map, markersLayer);

        window.addEventListener('resize', () => {
            setTimeout(() => map.invalidateSize(), 150);
        });
    }

    async function loadFirebaseData(map, markersLayer) {
        // Only run if Firebase was loaded via the module script in HTML
        try {
            const db = window._tabangDb;
            if (!db) return;

            const { collection, getDocs } = window._firestoreFns;

            const [fSnap, hSnap] = await Promise.all([
                getDocs(collection(db, 'floodReports')),
                getDocs(collection(db, 'helpRequests'))
            ]);

            const extra = [];

            fSnap.forEach(doc => {
                const d = doc.data();
                if (d.latitude && d.longitude) {
                    extra.push({
                        name: `Flood report: ${d.submittedBy || 'Anonymous'}`,
                        lat: d.latitude, lng: d.longitude,
                        type: 'user',
                        detail: d.details || 'No details',
                        locationText: d.location || '',
                        img: d.imageUrls?.[0] || '',
                        ts: d.timestamp?.toDate?.().toLocaleString() || ''
                    });
                }
            });

            hSnap.forEach(doc => {
                const d = doc.data();
                if (d.latitude && d.longitude) {
                    extra.push({
                        name: `Help: ${d.name || d.submittedBy || 'Anonymous'}`,
                        lat: d.latitude, lng: d.longitude,
                        type: 'help',
                        detail: d.description || 'No description',
                        phone: d.phone || '',
                        img: d.imageUrls?.[0] || '',
                        ts: d.timestamp?.toDate?.().toLocaleString() || ''
                    });
                }
            });

            // Re-render with all data combined
            addMarkersToMap(map, markersLayer, [...aklanIncidents, ...extra]);

        } catch (err) {
            console.warn('Firebase data not loaded for map:', err.message);
        }
    }

    // Run after page is fully loaded
    if (document.readyState === 'complete') {
        initMap();
    } else {
        window.addEventListener('load', initMap);
    }
})();
