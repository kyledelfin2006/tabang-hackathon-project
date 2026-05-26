import { db, auth } from "../javascript/firebase.js";
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
        showToast("Your browser does not support GPS location. Please tap the map to pin your location.");
        return;
    }
    showToast("Getting your current location...");
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            if (!mapInitialized) initMap();
            map.setView([lat, lng], 14);
            marker.setLatLng([lat, lng]);
            updateCoords({ lat, lng });
            showToast("Location pinned from GPS. Drag the marker if needed.");
        },
        (error) => {
            let msg = "Could not get your location. ";
            if (error.code === 1) msg += "Allow location access or tap the map manually.";
            else if (error.code === 2) msg += "Please check GPS or tap the map manually.";
            else msg += "Please try again or tap the map manually.";
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
        showToast(`You can upload up to ${MAX_IMAGES} images. Remove one before adding more.`);
        return;
    }
    files.forEach(file => {
        if (file.size > MAX_FILE_SIZE) {
            showToast(`${file.name} is too large. Please choose an image under 5MB.`);
            return;
        }
        if (!file.type.startsWith('image/')) {
            showToast(`${file.name} is not an image. Please choose a photo file.`);
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
    showToast('Photo removed.');
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

function markInvalid(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const wrapper = el.closest('.input-box, .textarea-box') || el;
    wrapper.style.boxShadow = '0 0 0 2px #ff3b30';
    el.focus();
    el.addEventListener('input', () => wrapper.style.boxShadow = '', { once: true });
}

function showMapPrompt(message) {
    showToast(message);
    mapContainer.classList.add('visible');
    if (!mapInitialized) {
        initMap();
        setTimeout(() => { if (map) map.invalidateSize(); }, 200);
    }
    toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i> Hide map';
    document.getElementById('coordHint').textContent = 'Tap the map or use GPS to set your exact location.';
}

// ----- Submit -----
document.getElementById('submitBtn').onclick = async function() {
    if (!currentUser) {
        showToast('Please log in before requesting help.');
        return;
    }
    const submitBtn = document.getElementById('submitBtn');
    const phone = document.getElementById('phoneInput').value.trim();
    const loc   = document.getElementById('locationInput').value.trim();
    const desc  = document.getElementById('descInput').value.trim();

    if (!phone) { showToast('Please enter the phone number responders can call.'); markInvalid('phoneInput'); return; }
    if (!/^[\d\s\+\-\(\)]{7,15}$/.test(phone)) { showToast('Please enter a valid phone number, 7 to 15 digits.'); markInvalid('phoneInput'); return; }
    if (!loc)   { showToast('Please enter your barangay, street, or nearby landmark.'); markInvalid('locationInput'); return; }
    if (!desc)  { showToast('Please describe what help you need.'); markInvalid('descInput'); return; }
    if (!selectedLat || !selectedLng) {
        showMapPrompt('Please pin your exact location on the map before submitting.');
        return;
    }

    const loadingDiv = document.getElementById('loading');
    loadingDiv.style.display = 'block';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

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
        const userData = userDoc.exists() ? userDoc.data() : null;
        const submittedBy = userData?.fullName || userData?.name || userData?.displayName || currentUser.displayName || currentUser.email || 'Unknown';

        await addDoc(collection(db, "helpRequests"), {
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
        showToast('Help request submitted. Redirecting...');
        setTimeout(() => navigateTo('MyReports.html'), 800);
    } catch (err) {
        console.error(err);
        showToast('Could not submit your request. Please check your connection and try again.');
    } finally {
        loadingDiv.style.display = 'none';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Request Help';
    }
};

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t.hideTimer);
    t.hideTimer = setTimeout(() => t.style.opacity = '0', 4000);
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
