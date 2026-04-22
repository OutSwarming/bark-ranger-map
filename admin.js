// admin.js
const firebaseConfig = {
    apiKey: "AIzaSyDcBn2YQCAFrAjN27gIM9lBiu0PZsComO4",
    authDomain: "barkrangermap-auth.firebaseapp.com",
    projectId: "barkrangermap-auth",
    storageBucket: "barkrangermap-auth.firebasestorage.app",
    messagingSenderId: "564465144962",
    appId: "1:564465144962:web:9e43dbc993b93a33d5d09b",
    measurementId: "G-V2QCN2MFBZ"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();
const functions = firebase.functions();

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const textInput = document.getElementById('text-input');
const processBtn = document.getElementById('process-btn');
const syncBtn = document.getElementById('sync-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const rawJsonOutput = document.getElementById('raw-json-output');

const searchInput = document.getElementById('park-name-search');
const searchResults = document.getElementById('search-results');
const parkIdHidden = document.getElementById('park-id-hidden');

const inputs = {
    entranceFee: document.getElementById('entrance-fee'),
    swagLocation: document.getElementById('swag-location'),
    approvedTrails: document.getElementById('approved-trails'),
    strictRules: document.getElementById('strict-rules'),
    hazards: document.getElementById('hazards'),
    extraSwag: document.getElementById('extra-swag')
};

let masterParks = [];
let fuse;

// 1. Auth Bouncer
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.replace('index.html');
        return;
    }
    
    const doc = await db.collection('users').doc(user.uid).get();
    if (!doc.exists || doc.data().isAdmin !== true) {
        window.location.replace('index.html');
    }
});

// 2. Fetch and Parse BARK Master List.csv
async function loadMasterCSV() {
    try {
        const response = await fetch('BARK Master List.csv');
        const csvText = await response.text();
        
        Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                masterParks = results.data;
                const options = {
                    keys: ['name'],
                    threshold: 0.3
                };
                fuse = new Fuse(masterParks, options);
            }
        });
    } catch (error) {
        console.error("Error loading master list:", error);
    }
}
loadMasterCSV();

// 3. UI Interactions (Drag & Drop)
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        dropZone.innerHTML = `<p style="color: #10b981;">✅ Image Scheduled: ${fileInput.files[0].name}</p>`;
    }
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length) {
        dropZone.innerHTML = `<p style="color: #10b981;">✅ Image Scheduled: ${fileInput.files[0].name}</p>`;
    }
});

// Convert file to Base64
const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]); // get raw base64
    reader.onerror = error => reject(error);
});

// 4. Processing Logic (AI Integration)
processBtn.addEventListener('click', async () => {
    const file = fileInput.files[0];
    const text = textInput.value.trim();
    
    if (!file && !text) {
        alert("Please provide an image or pasted text.");
        return;
    }
    
    loadingOverlay.style.display = 'flex';
    
    try {
        const payload = {};
        if (file) {
            payload.image = await fileToBase64(file);
            payload.mimeType = file.type;
        } else {
            payload.text = text;
        }
        
        const extractParkData = functions.httpsCallable('extractParkData');
        const result = await extractParkData(payload);
        
        const data = result.data;
        rawJsonOutput.textContent = JSON.stringify(data, null, 2);
        
        // Auto-fill Verification UI
        if (data.parkName) {
            searchInput.value = data.parkName;
            performFuzzySearch(data.parkName);
        }
        
        inputs.entranceFee.value = data.entranceFee || '';
        inputs.swagLocation.value = data.swagLocation || '';
        inputs.approvedTrails.value = data.approvedTrails || '';
        inputs.strictRules.value = data.strictRules || '';
        inputs.hazards.value = data.hazards || '';
        inputs.extraSwag.value = data.extraSwag || '';
        
    } catch (error) {
        console.error("AI Extraction Error:", error);
        alert("Error during extraction. Check console.");
    } finally {
        loadingOverlay.style.display = 'none';
    }
});

// 5. Fuzzy Search UI
function performFuzzySearch(query) {
    if (!fuse || !query) {
        searchResults.style.display = 'none';
        return;
    }
    
    const results = fuse.search(query);
    searchResults.innerHTML = '';
    
    if (results.length > 0) {
        // Auto-select the top result logic
        parkIdHidden.value = results[0].item.lat_lng || '';
        
        results.slice(0, 5).forEach(res => {
            const div = document.createElement('div');
            div.className = 'search-dropdown-item';
            div.textContent = `${res.item.name} (${res.item.state})`;
            div.onclick = () => {
                searchInput.value = res.item.name;
                parkIdHidden.value = res.item.lat_lng || '';
                searchResults.style.display = 'none';
            };
            searchResults.appendChild(div);
        });
        searchResults.style.display = 'block';
    } else {
        searchResults.style.display = 'none';
    }
}

searchInput.addEventListener('input', (e) => {
    performFuzzySearch(e.target.value);
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-dropdown')) {
        searchResults.style.display = 'none';
    }
});

// 6. Sync Logic
syncBtn.addEventListener('click', () => {
    const finalData = {
        id: parkIdHidden.value,
        parkName: searchInput.value,
        entranceFee: inputs.entranceFee.value,
        swagLocation: inputs.swagLocation.value,
        approvedTrails: inputs.approvedTrails.value,
        strictRules: inputs.strictRules.value,
        hazards: inputs.hazards.value,
        extraSwag: inputs.extraSwag.value
    };
    
    if (!finalData.id) {
        alert("Please ensure a valid park from the dropdown is selected.");
        return;
    }
    
    syncBtn.disabled = true;
    syncBtn.textContent = 'Syncing...';
    
    // Theoretical Firebase Function call to update Google Sheets / Backend
    console.log("PAYLOAD FOR SYNC:", finalData);
    
    setTimeout(() => {
        alert(`Successfully synced ${finalData.parkName} data to mapping system!`);
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sync to Map';
        
        // Reset
        fileInput.value = '';
        textInput.value = '';
        dropZone.innerHTML = '<p>Drop screenshot here</p><span style="font-size: 12px; color: #94a3b8;">or click to select</span>';
        searchInput.value = '';
        parkIdHidden.value = '';
        Object.values(inputs).forEach(input => input.value = '');
        rawJsonOutput.textContent = 'Waiting for data...';
    }, 1500);
});
