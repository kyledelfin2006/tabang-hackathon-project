import { db, auth } from "./firebase.js";
import { addDoc, collection, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

function navigateTo(page) { window.location.href = page; }

// Navigation
document.getElementById('navRequest').onclick  = () => navigateTo('RequestHelp.html');
document.getElementById('navHotlines').onclick = () => navigateTo('Hotline.html');
document.getElementById('navReport').onclick   = () => navigateTo('ReportFlood.html');
document.getElementById('navMyReports').onclick= () => navigateTo('MyReports.html');
document.getElementById('navAccount').onclick  = () => navigateTo('AccountInfo.html');
document.getElementById('backBtn').onclick     = () => navigateTo('Homepage.html');

// Cloudinary config (replace with our own)
const CLOUD_NAME = 'dz9edwf4q';
const UPLOAD_PRESET = 'tabang_uploads';

let currentUser = null;
let selectedImages = [];
const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// ----- MAP LOGIC (lazy initialization) -----
let map = null;
let marker = null;
let selectedLat = null;
let selectedLng = null;
let mapInitialized = false;

function initMap() {
    if (mapInitialized) return;
    const container = document.getElementById('locationMap');
    if (!container) return;

    const defaultCenter = [11.6, 122.4]; // Aklan, Philippines
    map = L.map(container).setView(defaultCenter, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    marker = L.marker(defaultCenter, { draggable: true }).addTo(map);

    marker.on('dragend', () => updateCoords(marker.getLatLng()));
    map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        updateCoords(e.latlng);
    });

    updateCoords({ lat: defaultCenter[0], lng: defaultCenter[1] });
    mapInitialized = true;
}

function updateCoords(latlng) {
    selectedLat = latlng.lat;
    selectedLng = latlng.lng;
    document.getElementById('coordHint').innerHTML = `📍 Marker at: ${selectedLat.toFixed(5)}, ${selectedLng.toFixed(5)}`;
    const statusDiv = document.getElementById('locationStatus');
    statusDiv.style.display = 'flex';
    document.getElementById('statusText').innerHTML = `Location pinned (${selectedLat.toFixed(4)}, ${selectedLng.toFixed(4)})`;
}

function useGPS() {
    if (!navigator.geolocation) {
        showToast("Geolocation not supported");
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            if (!mapInitialized) initMap();
            map.setView([lat, lng], 14);
            marker.setLatLng([lat, lng]);
            updateCoords({ lat, lng });
            showToast("Location updated");
        },
        (error) => {
            let msg = "Could not get location. ";
            if (error.code === 1) msg += "Permission denied.";
            else msg += "Try again later.";
            showToast(msg);
        }
    );
}

// Toggle map visibility
const toggleBtn = document.getElementById('toggleMapBtn');
const mapContainer = document.getElementById('mapContainer');
toggleBtn.addEventListener('click', () => {
    const isVisible = mapContainer.classList.toggle('visible');
    if (isVisible && !mapInitialized) {
        initMap();
        setTimeout(() => { if (map) map.invalidateSize(); }, 200);
    }
    toggleBtn.innerHTML = isVisible ? '<i class="fas fa-chevron-up"></i> Hide map' : '<i class="fas fa-map-pin"></i> Pin your exact location on map';
});

// ----- Image upload handling -----
const uploadBox    = document.getElementById('uploadBox');
const fileInput    = document.getElementById('fileInput');
const imagePreview = document.getElementById('imagePreview');
const imageCount   = document.getElementById('imageCount');

uploadBox.onclick = () => fileInput.click();

fileInput.onchange = function(e) {
    const files = Array.from(e.target.files);
    if (selectedImages.length + files.length > MAX_IMAGES) {
        showToast(`Maximum ${MAX_IMAGES} images allowed`);
        return;
    }
    files.forEach(file => {
        if (file.size > MAX_FILE_SIZE) {
            showToast(`File ${file.name} is too large (max 5MB)`);
            return;
        }
        if (!file.type.startsWith('image/')) {
            showToast(`File ${file.name} is not an image`);
            return;
        }
        const reader = new FileReader();
        reader.onload = function(evt) {
            selectedImages.push({
                data: evt.target.result,
                name: file.name,
                type: file.type,
                file: file
            });
            updatePreview();
        };
        reader.readAsDataURL(file);
    });
    fileInput.value = '';
};

function updatePreview() {
    imagePreview.innerHTML = '';
    selectedImages.forEach((img, index) => {
        const div = document.createElement('div');
        div.className = 'preview-item';
        div.innerHTML = `
                <img src="${img.data}" alt="Preview">
                <div class="remove-image" onclick="removeImage(${index})">×</div>
            `;
        imagePreview.appendChild(div);
    });
    imageCount.textContent = `${selectedImages.length} image(s) selected`;
}

window.removeImage = function(index) {
    selectedImages.splice(index, 1);
    updatePreview();
};

// Cloudinary upload
async function uploadToCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
    const response = await fetch(url, { method: 'POST', body: formData });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Upload failed');
    }
    const data = await response.json();
    return data.secure_url;
}

// ----- Submit -----
document.getElementById('submitBtn').onclick = async function() {
    if (!currentUser) {
        showToast('You must be logged in.');
        return;
    }
    const name  = document.getElementById('nameInput').value.trim();
    const phone = document.getElementById('phoneInput').value.trim();
    const loc   = document.getElementById('locationInput').value.trim();
    const desc  = document.getElementById('descInput').value.trim();

    if (!name)  { showToast('Please enter your name'); return; }
    if (!phone) { showToast('Please enter your phone number'); return; }
    if (!loc)   { showToast('Please enter your location'); return; }
    if (!desc)  { showToast('Please describe your situation'); return; }
    if (!selectedLat || !selectedLng) {
        showToast('Please pin your exact location on the map (click "Pin your exact location" button)');
        return;
    }

    const loadingDiv = document.getElementById('loading');
    loadingDiv.style.display = 'block';
    document.getElementById('submitBtn').disabled = true;

    try {
        let imageUrls = [];
        if (selectedImages.length > 0) {
            const uploadPromises = selectedImages.map(img => uploadToCloudinary(img.file));
            imageUrls = await Promise.all(uploadPromises);
        }

        // Fetch user name
        let userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (!userDoc.exists()) {
            userDoc = await getDoc(doc(db, 'responders', currentUser.uid));
        }
        const submittedBy = userDoc.exists() ? userDoc.data().fullName : currentUser.displayName || currentUser.email || name;

        await addDoc(collection(db, "helpRequests"), {
            name: name,
            phone: phone,
            location: loc,
            description: desc,
            latitude: selectedLat,
            longitude: selectedLng,
            timestamp: new Date(),
            userId: currentUser.uid,
            submittedBy: submittedBy,
            imageUrls: imageUrls,
            type: "help"
        });
        navigateTo('MyReports.html');
    } catch (err) {
        console.error(err);
        showToast('Error: ' + err.message);
    } finally {
        loadingDiv.style.display = 'none';
        document.getElementById('submitBtn').disabled = false;
    }
};

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.opacity = '1';
    setTimeout(() => t.style.opacity = '0', 3000);
}

// Auth
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('submitBtn').disabled = false;
    } else {
        currentUser = null;
        document.getElementById('submitBtn').disabled = true;
        showToast('Please log in to request help.');
    }
});

// GPS button inside map container
document.getElementById('gpsBtn').onclick = useGPS;