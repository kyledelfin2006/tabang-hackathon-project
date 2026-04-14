    // Firebase imports: database, auth instance, Firestore write helpers, and auth state listener

    import { db, auth } from "./firebase.js";
    import { addDoc, collection, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
    import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

    let currentUser = null;     // Holds the authenticated Firebase user throughout the session

    // Cache frequently accessed DOM elements to avoid repeated getElementById calls
    const submitBtn = document.querySelector('.submit-btn');
    const emailInput = document.getElementById('field-email');
    const toast = document.getElementById('toast');
    const idFileInput = document.getElementById('idFile');
    const selfieFileInput = document.getElementById('selfieFile');
    const idFileNameSpan = document.getElementById('idFileName');
    const selfieFileNameSpan = document.getElementById('selfieFileName');
    const idPreviewDiv = document.getElementById('idPreview');
    const selfiePreviewDiv = document.getElementById('selfiePreview');

    // Shows a toast notification of the given type ('error' or 'success'), auto-hiding after 3 seconds;
    // clears any existing timer so rapid calls don't cause the toast to disappear prematurely
    function showToast(msg, type) {
    toast.textContent = msg;
    toast.className = 'toast-visible ' + (type || 'error');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.className = '', 3000);
}

    // Reads a selected file and renders a thumbnail preview inside the given container,
    // also updating the filename label; clears both if no file is provided
    function previewImage(file, previewContainer, fileNameSpan) {
    if (file) {
    fileNameSpan.textContent = file.name;
    const reader = new FileReader();
    reader.onload = function(e) {
    previewContainer.innerHTML = `<img src="${e.target.result}" style="max-width:100%;max-height:120px;border-radius:10px;margin-top:8px;border:1px solid rgba(255,255,255,0.15);">`;
};
    reader.readAsDataURL(file);
} else {
    fileNameSpan.textContent = 'No file chosen';
    previewContainer.innerHTML = '';
}
}

    // Converts a File object to a base64-encoded Data URL string for embedding in Firestore
    function fileToBase64(file) {
    return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
});
}

    // Trigger image preview whenever the user selects a new ID or selfie file
    idFileInput.addEventListener('change', () => previewImage(idFileInput.files[0], idPreviewDiv, idFileNameSpan));
    selfieFileInput.addEventListener('change', () => previewImage(selfieFileInput.files[0], selfiePreviewDiv, selfieFileNameSpan));

    // On auth state change: pre-fill and lock the email field for signed-in users,
    // or disable the form and inject a login warning banner for guests
    onAuthStateChanged(auth, (user) => {
    if (user) {
    currentUser = user;
    emailInput.value = user.email;
    emailInput.readOnly = true;     // Prevent the user from changing their own email
    submitBtn.disabled = false;
    // Remove the warning banner if the user signs in while on this page
    const warning = document.querySelector('.login-warning');
    if (warning) warning.remove();
} else {
    currentUser = null;
    submitBtn.disabled = true;
    // Inject a login prompt at the top of the card if it isn't already there
    const card = document.querySelector('.card');
    let warning = document.querySelector('.login-warning');
    if (!warning) {
    warning = document.createElement('div');
    warning.className = 'login-warning';
    warning.innerHTML = `<div style="padding:12px;margin-bottom:4px;"><i class="fas fa-exclamation-triangle" style="margin-right:8px;"></i>You must be logged in to verify your account. <a href="../Login.html">Log in</a></div>`;
    card.insertBefore(warning, card.firstChild);
}
    showToast('Please log in to verify your account.', 'error');
}
});

    // Navigate back to the account info page when the back button is clicked
    document.querySelector('.back-btn').onclick = () => window.location.href = 'AccountInfo.html';

    // Attaches a live validation listener to an input — adds the 'valid' class to its wrapper
    // when the checkFn passes, and removes it when it doesn't
    function validate(inputId, wrapperId, checkFn) {
    const input = document.getElementById(inputId);
    const wrapper = document.getElementById(wrapperId);
    if (!input || !wrapper) return;
    input.addEventListener('input', () => {
    checkFn(input.value.trim()) ? wrapper.classList.add('valid') : wrapper.classList.remove('valid');
});
}

    // Wire up inline validation for each field with its specific pass condition
    validate('field-name',     'wrap-name',     (v) => v.split(/\s+/).filter(w => w.length > 0).length >= 2);  // Requires at least two words
    validate('field-mobile',   'wrap-mobile',   (v) => /^\d{11}$/.test(v.replace(/\s/g, '')));                 // Must be exactly 11 digits
    validate('field-email',    'wrap-email',    (v) => v.includes('@') && v.includes('.'));
    validate('field-barangay', 'wrap-barangay', (v) => v.length >= 2);
    validate('field-landmark', 'wrap-landmark', (v) => v.length > 0);

    // Handles form submission: validates all fields and file inputs, converts images to base64,
    // resolves the submitter's display name, then writes the verification document to Firestore
    submitBtn.onclick = async function() {
    if (!currentUser) { showToast('⚠️ You must be logged in to submit.', 'error'); return; }

    const name     = document.getElementById('field-name').value.trim();
    const mobile   = document.getElementById('field-mobile').value.trim().replace(/\s/g, '');
    const barangay = document.getElementById('field-barangay').value.trim();

    // Final submission-time validation — catches cases where inline validation was bypassed
    if (name.split(/\s+/).filter(w => w.length > 0).length < 2) { showToast('⚠️ Please enter your full name.', 'error'); return; }
    if (!/^\d{11}$/.test(mobile)) { showToast('⚠️ Mobile number must be 11 digits.', 'error'); return; }
    if (barangay.length < 2) { showToast('⚠️ Please enter your barangay.', 'error'); return; }

    const idFile     = idFileInput.files[0];
    const selfieFile = selfieFileInput.files[0];
    if (!idFile)     { showToast('⚠️ Please upload a government ID.', 'error'); return; }
    if (!selfieFile) { showToast('⚠️ Please upload a recent selfie.', 'error'); return; }

    // Enforce a 500KB size cap per image to stay within Firestore's 1MB document limit
    const MAX_FILE_SIZE = 500 * 1024;
    if (idFile.size > MAX_FILE_SIZE)     { showToast('⚠️ ID image must be less than 500KB.', 'error'); return; }
    if (selfieFile.size > MAX_FILE_SIZE) { showToast('⚠️ Selfie must be less than 500KB.', 'error'); return; }

    // Disable the button while submitting to prevent duplicate submissions
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
    // Convert both images to base64 for direct storage in the Firestore document
    const idBase64     = await fileToBase64(idFile);
    const selfieBase64 = await fileToBase64(selfieFile);

    // Try 'users' collection first; fall back to 'responders' if the user isn't found there
    let userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    if (!userDoc.exists()) {
    userDoc = await getDoc(doc(db, 'responders', currentUser.uid));
}
    const submittedBy = userDoc.exists() ? userDoc.data().fullName : currentUser.displayName || currentUser.email || name;

    await addDoc(collection(db, "verifications"), {
    name, mobile: '+63' + mobile, barangay,   // Prepend country code to the mobile number
    email: emailInput.value.trim(),
    landmark: document.getElementById('field-landmark').value.trim(),
    timestamp: new Date(),
    userId: currentUser.uid,
    submittedBy: submittedBy,
    idPhotoBase64: idBase64, selfieBase64
});

    showToast('✅ Verification submitted!', 'success');
    // Short delay so the user can read the success toast before being redirected
    setTimeout(() => window.location.href = 'AccountInfo.html', 2500);

} catch (err) {
    showToast('⚠️ ' + err.message, 'error');
    // Re-enable the button so the user can correct the error and try again
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';
}
};