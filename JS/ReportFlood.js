// Firebase imports: auth, database instance, email sign-in helper, and Firestore doc helpers
import { db, auth } from "../javascript/firebase.js";
import { addDoc, collection, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Helper to navigate to another page
function navigateTo(page) { window.location.href = page; }

// Bottom navigation bar and back button routing
document.querySelector('.back-btn').onclick = () => navigateTo('Homepage.html');
document.getElementById('navRequest').onclick = () => navigateTo('RequestHelp.html');
document.getElementById('navHotlines').onclick = () => navigateTo('Hotline.html');
document.getElementById('navReport').onclick = () => navigateTo('ReportFlood.html');
document.getElementById('navMyReports').onclick = () => navigateTo('MyReports.html');
document.getElementById('navAccount').onclick = () => navigateTo('AccountInfo.html');

// Cloudinary credentials for image upload
const CLOUD_NAME = 'dz9edwf4q';
const UPLOAD_PRESET = 'tabang_uploads';

let currentUser = null;         // Holds the authenticated Firebase user
let selectedImages = [];        // Array of image objects staged for upload
const MAX_IMAGES = 5;           // Maximum number of images per report
const MAX_FILE_SIZE = 5 * 1024 * 1024;  // 5MB per image

// ----- MAP LOGIC (lazy initialization) -----
let map = null;
let marker = null;
let selectedLat = null;     // Latitude set by map click or GPS
let selectedLng = null;     // Longitude set by map click or GPS
let mapInitialized = false; // Guard flag to prevent re-initializing the Leaflet map

// Creates the Leaflet map centered on Aklan — only runs once when the map panel is first shown
function initMap() {
    if (mapInitialized) return;
    const container = document.getElementById('locationMap');
    if (!container) return;

    const defaultCenter = [11.6, 122.4];
    map = L.map(container).setView(defaultCenter, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Place a draggable marker so the user can fine-tune the pin position
    marker = L.marker(defaultCenter, { draggable: true }).addTo(map);

    // Update coordinates when the marker is dragged or the map is clicked
    marker.on('dragend', () => updateCoords(marker.getLatLng()));
    map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        updateCoords(e.latlng);
    });

    mapInitialized = true;
}

// Stores the selected coordinates and updates the coordinate hint and status indicator in the UI
function updateCoords(latlng) {
    selectedLat = latlng.lat;
    selectedLng = latlng.lng;
    document.getElementById('coordHint').innerHTML = `📍 Marker at: ${selectedLat.toFixed(5)}, ${selectedLng.toFixed(5)}`;
    // Reveal the location status bar with the pinned coordinates
    const statusDiv = document.getElementById('locationStatus');
    statusDiv.style.display = 'flex';
    document.getElementById('statusText').innerHTML = `Location pinned (${selectedLat.toFixed(4)}, ${selectedLng.toFixed(4)})`;
}

// Requests the device's GPS location and moves the map marker to that position
function useGPS() {
    if (!navigator.geolocation) {
        showToast("Your browser does not support GPS location. Please tap the map to pin the flood location.");
        return;
    }
    showToast("Getting your current location...");
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            // Initialize the map first if it hasn't been shown yet
            if (!mapInitialized) initMap();
            map.setView([lat, lng], 14);
            marker.setLatLng([lat, lng]);
            updateCoords({ lat, lng });
            showToast("Location pinned from GPS. Drag the marker if needed.");
        },
        (error) => {
            // Provide a specific message for permission denial vs other errors
            let msg = "Could not get your location. ";
            if (error.code === 1) msg += "Allow location access or tap the map manually.";
            else if (error.code === 2) msg += "Please check GPS or tap the map manually.";
            else msg += "Please try again or tap the map manually.";
            showToast(msg);
        }
    );
}

// Toggle the map panel visibility; initialize the map on first reveal and fix tile rendering
const toggleBtn = document.getElementById('toggleMapBtn');
const mapContainer = document.getElementById('mapContainer');
toggleBtn.addEventListener('click', () => {
    const isVisible = mapContainer.classList.toggle('visible');
    if (isVisible && !mapInitialized) {
        initMap();
        // Leaflet needs a size recalculation after the container becomes visible
        setTimeout(() => { if (map) map.invalidateSize(); }, 200);
    }
    toggleBtn.innerHTML = isVisible ? '<i class="fas fa-chevron-up"></i> Hide map' : '<i class="fas fa-map-pin"></i> Pin exact location on map';
});

// ----- Image upload -----
const uploadBox = document.getElementById('uploadBox');
const fileInput = document.getElementById('fileInput');
const imagePreview = document.getElementById('imagePreview');
const imageCount = document.getElementById('imageCount');

// Trigger the hidden file input when the upload box is clicked
uploadBox.onclick = () => fileInput.click();

// Validate and stage selected files — enforces image type, file size, and max count limits
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
        // Read the file as a Data URL so it can be previewed before uploading
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
    // Reset the input so selecting the same file again triggers the change event
    fileInput.value = '';
};

// Re-renders the image preview grid from the current selectedImages array
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

// Removes an image from the staged list by index and refreshes the preview
window.removeImage = function(index) {
    selectedImages.splice(index, 1);
    updatePreview();
    showToast('Photo removed.');
};

// Uploads a single image file to Cloudinary and returns its secure CDN URL
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
    document.getElementById('coordHint').textContent = 'Tap the map or use GPS to set the exact flood location.';
}

// ----- Submit report -----
// Validates inputs, uploads images in parallel, resolves the submitter's name,
// then writes the flood report document to Firestore
document.getElementById('submitBtn').onclick = async function() {
    if (!currentUser) {
        showToast('Please log in before submitting a flood report.');
        return;
    }
    const submitBtn = document.getElementById('submitBtn');
    const loc = document.getElementById('locationInput').value.trim();
    const det = document.getElementById('detailsInput').value.trim();

    // Require a text location description
    if (!loc) {
        showToast('Please enter the barangay, street, or nearby landmark.');
        markInvalid('locationInput');
        return;
    }
    // Require a map pin — GPS or manual click
    if (!selectedLat || !selectedLng) {
        showMapPrompt('Please pin the exact flood location on the map before submitting.');
        return;
    }

    const loadingDiv = document.getElementById('loading');
    loadingDiv.style.display = 'block';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
        // Upload all staged images to Cloudinary in parallel for efficiency
        let imageUrls = [];
        if (selectedImages.length > 0) {
            const uploadPromises = selectedImages.map(img => uploadToCloudinary(img.file));
            imageUrls = await Promise.all(uploadPromises);
        }

        // Try 'users' collection first; fall back to 'responders' if not found
        let userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (!userDoc.exists()) {
            userDoc = await getDoc(doc(db, 'responders', currentUser.uid));
        }
        const submittedBy = userDoc.exists() ? userDoc.data().fullName : currentUser.displayName || currentUser.email || 'Unknown';

        await addDoc(collection(db, "floodReports"), {
            location: loc,
            latitude: selectedLat,
            longitude: selectedLng,
            details: det || 'No additional details provided.',
            timestamp: new Date(),
            userId: currentUser.uid,
            submittedBy: submittedBy,
            imageUrls: imageUrls,
            type: "flood"
        });

        showToast('Flood report submitted. Redirecting...');
        setTimeout(() => navigateTo('MyReports.html'), 800);
    } catch (err) {
        console.error(err);
        showToast('Could not submit your report. Please check your connection and try again.');
    } finally {
        // Always re-enable the submit button and hide the loader regardless of outcome
        loadingDiv.style.display = 'none';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Report';
    }
};

// Displays a brief toast notification and fades it out after 3 seconds
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t.hideTimer);
    t.hideTimer = setTimeout(() => t.style.opacity = '0', 4000);
}

// Enable or disable the submit button based on the user's auth state
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('submitBtn').disabled = false;
    } else {
        currentUser = null;
        document.getElementById('submitBtn').disabled = true;
        showToast('Please log in to report a flood.');
    }
});

// Wire up the GPS button to the useGPS function
document.getElementById('gpsBtn').onclick = useGPS;
