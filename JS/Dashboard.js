// Firebase imports: Firestore instance and helpers for reading collections
import { db } from "./javascript/firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Static incident data for the surrounding Visayas region (pre-seeded, not from Firestore)
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

// Bounding box used to filter only incidents within the Aklan area
const aklanBounds = {
    minLat: 11.3, maxLat: 12.0,
    minLng: 121.8, maxLng: 122.6
};

// Filter the static incidents list to only those falling within Aklan's coordinates
const aklanIncidents = incidents.filter(inc =>
    inc.lat >= aklanBounds.minLat && inc.lat <= aklanBounds.maxLat &&
    inc.lng >= aklanBounds.minLng && inc.lng <= aklanBounds.maxLng
);

// Color map for each incident/report type used to style map markers
const cmap = {
    flood:   '#378ADD',
    fire:    '#EF9F27',
    quake:   '#888780',
    typhoon: '#33b4a5',
    evac:    '#4caf7d',
    user:    '#ff8c42',    // flood reports from users
    help:    '#aa66ff'     // help requests
};

let map;
// Layer group that holds all map markers — cleared and repopulated on each render
let markersLayer = L.layerGroup();

// Fetches user-submitted flood reports from Firestore and maps them to marker-ready objects
async function loadFloodReports() {
    try {
        const querySnapshot = await getDocs(collection(db, "floodReports"));
        const reports = [];
        querySnapshot.forEach(doc => {
            const data = doc.data();
            // Only include reports that have valid GPS coordinates
            if (data.latitude && data.longitude) {
                reports.push({
                    name: `Flood report: ${data.submittedBy || 'Anonymous'}`,
                    lat: data.latitude,
                    lng: data.longitude,
                    type: 'user',
                    detail: data.details || 'No details',
                    locationText: data.location || '',
                    imageUrls: data.imageUrls || [],
                    // Convert Firestore Timestamp to JS Date, falling back to now if missing
                    timestamp: data.timestamp?.toDate?.() || new Date()
                });
            }
        });
        return reports;
    } catch (err) {
        console.error("Error loading flood reports:", err);
        return [];
    }
}

// Fetches help requests from Firestore and maps them to marker-ready objects
async function loadHelpRequests() {
    try {
        const querySnapshot = await getDocs(collection(db, "helpRequests"));
        const requests = [];
        querySnapshot.forEach(doc => {
            const data = doc.data();
            // Only include requests that have valid GPS coordinates
            if (data.latitude && data.longitude) {
                requests.push({
                    name: `Help request: ${data.name || data.submittedBy || 'Anonymous'}`,
                    lat: data.latitude,
                    lng: data.longitude,
                    type: 'help',
                    detail: data.description || 'No description',
                    phone: data.phone || '',
                    imageUrls: data.imageUrls || [],
                    // Convert Firestore Timestamp to JS Date, falling back to now if missing
                    timestamp: data.timestamp?.toDate?.() || new Date()
                });
            }
        });
        return requests;
    } catch (err) {
        console.error("Error loading help requests:", err);
        return [];
    }
}

// Clears existing markers and re-plots all reports/incidents on the map as styled circle markers
function addMarkersToMap(reports) {
    markersLayer.clearLayers();
    reports.forEach(inc => {
        let color, radius, popupContent;

        if (inc.type === 'user') {
            // User-submitted flood report marker — orange, with location text and image link
            color = cmap.user;
            radius = 8;
            popupContent = `
                    <strong>📢 ${inc.name}</strong><br>
                    📍 ${inc.locationText ? inc.locationText + '<br>' : ''}
                    ${inc.detail}<br>
                    <small>📅 ${inc.timestamp.toLocaleString()}</small><br>
                    ${inc.imageUrls && inc.imageUrls.length ? `<a href="${inc.imageUrls[0]}" target="_blank">📷 View image</a>` : ''}
                `;
        } else if (inc.type === 'help') {
            // Help request marker — purple, with phone number and image link
            color = cmap.help;
            radius = 8;
            popupContent = `
                    <strong>🆘 ${inc.name}</strong><br>
                    📞 Phone: ${inc.phone}<br>
                    ${inc.detail}<br>
                    <small>📅 ${inc.timestamp.toLocaleString()}</small><br>
                    ${inc.imageUrls && inc.imageUrls.length ? `<a href="${inc.imageUrls[0]}" target="_blank">📷 View image</a>` : ''}
                `;
        } else {
            // Static incident marker — color from cmap, typhoons get a slightly larger radius
            color = cmap[inc.type] || '#888780';
            radius = inc.type === 'typhoon' ? 10 : 8;
            popupContent = `
                    <strong>${inc.name}</strong><br>
                    ${inc.detail}<br>
                    <small>Type: ${inc.type}</small>
                `;
        }

        // Create a Leaflet circle marker and attach the popup, then add it to the layer group
        const marker = L.circleMarker([inc.lat, inc.lng], {
            radius: radius,
            fillColor: color,
            color: '#fff',
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.9
        }).bindPopup(popupContent);
        markersLayer.addLayer(marker);
    });
}

// Initialize the Leaflet map and load all data once the DOM is ready
window.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('dashMap');
    const loadingEl = document.getElementById('dashMapLoading');

    // Center the map over Aklan at zoom level 9
    map = L.map(container).setView([11.6, 122.4], 9);

    // Add OpenStreetMap tiles as the base layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    markersLayer.addTo(map);

    // Fetch live Firestore data and merge with static incidents, then render all markers
    const floodReports = await loadFloodReports();
    const helpRequests = await loadHelpRequests();
    const allReports = [...aklanIncidents, ...floodReports, ...helpRequests];
    addMarkersToMap(allReports);

    // Hide the loading overlay once markers are rendered
    if (loadingEl) loadingEl.style.display = 'none';

    // Recalculate map dimensions on window resize to prevent rendering gaps
    window.addEventListener('resize', () => setTimeout(() => map.invalidateSize(), 100));
});