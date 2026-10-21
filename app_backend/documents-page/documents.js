let documents = [];
let selectedFile = null;
let db;

/* =========================
   AUTH
========================= */
const user =
    JSON.parse(localStorage.getItem("loggedInUser")) ||
    JSON.parse(sessionStorage.getItem("loggedInUser"));

if (!user) {
    // Uncomment this when you want strict authentication:
    // window.location.href = "../login.html";
}

function logout(){
    localStorage.removeItem("loggedInUser");
    sessionStorage.removeItem("loggedInUser");
    window.location.href = "../login.html";
}

/* =========================
   INDEXED DB
========================= */
// BUGFIX: this database used to be named the same thing for every
// account ("AutoNexusDocumentsDB"), so it was really one shared,
// browser-wide document store — any document any user uploaded was
// visible to every other account on the same browser. A brand-new
// profile would "have" documents left over from whichever account was
// used before it. Naming the database per logged-in user gives each
// account its own fully isolated document store, the same way bookings
// and vehicles are already isolated per user in autonexus-sync.js.
const CURRENT_USER_ID =
    user && user.id != null ? String(user.id) : "guest";
const DB_NAME = `AutoNexusDocumentsDB_${CURRENT_USER_ID}`;
const STORE_NAME = "documents";
function openDB(){
    return new Promise((resolve,reject)=>{
        const request = indexedDB.open(DB_NAME,1);

        request.onupgradeneeded = e => {
            const database = e.target.result;
            if(!database.objectStoreNames.contains(STORE_NAME)){
                database.createObjectStore(STORE_NAME,{keyPath:"id"});
            }
        };

        request.onsuccess = e => {
            db = e.target.result;
            resolve(db);
        };

        request.onerror = () => reject(request.error);
    });
}

function getAllDocuments(){
    return new Promise((resolve,reject)=>{
        const transaction = db.transaction(STORE_NAME,"readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function putDocument(document){
    return new Promise((resolve,reject)=>{
        const transaction = db.transaction(STORE_NAME,"readwrite");
        transaction.objectStore(STORE_NAME).put(document);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

function deleteDocumentFromDB(id){
    return new Promise((resolve,reject)=>{
        const transaction = db.transaction(STORE_NAME,"readwrite");
        transaction.objectStore(STORE_NAME).delete(id);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

function syncDocumentMetadata(){
    // Blobs stay in IndexedDB; metadata is mirrored for the dashboard and other pages.
    const metadata = documents.map(({fileBlob,...doc})=>doc);
    try{
        localStorage.setItem("autonexus_documents",JSON.stringify(metadata));
    }catch{
        if(window.AutoNexusSync && window.AutoNexusSync.isStorageReliable && !window.AutoNexusSync.isStorageReliable()){
            // Storage warning banner is already shown by autonexus-sync.js.
        }
    }
}

/* =========================
   HELPERS
========================= */
function escapeHTML(value){
    return String(value).replace(/[&<>"']/g,char=>({
        "&":"&amp;",
        "<":"&lt;",
        ">":"&gt;",
        '"':"&quot;",
        "'":"&#039;"
    }[char]));
}

function formatDate(date){
    if(!date) return "Not specified";

    return new Date(date + "T00:00:00").toLocaleDateString("en-IN",{
        day:"2-digit",
        month:"short",
        year:"numeric"
    });
}

function daysUntil(date){
    if(!date) return null;

    const today = new Date();
    today.setHours(0,0,0,0);

    const expiry = new Date(date + "T00:00:00");
    return Math.ceil((expiry-today)/86400000);
}

function expiryStatus(date){
    const days = daysUntil(date);

    if(days === null) return {
        text:"No expiry",
        className:"expiry-valid"
    };

    if(days < 0) return {
        text:"Expired",
        className:"expiry-expired"
    };

    if(days <= 30) return {
        text:`${days} days left`,
        className:"expiry-warning"
    };

    return {
        text:`${days} days left`,
        className:"expiry-valid"
    };
}

function iconFor(category){
    const icons = {
        Insurance:"fa-shield-halved",
        RC:"fa-id-card",
        PUC:"fa-leaf",
        License:"fa-address-card",
        Service:"fa-screwdriver-wrench",
        Other:"fa-file"
    };

    return icons[category] || "fa-file";
}

function formatSize(bytes){
    if(!bytes) return "0 KB";
    if(bytes < 1024*1024) return `${Math.round(bytes/1024)} KB`;
    return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}

/* =========================
   DEFAULT DATA
========================= */
async function initialize(){
    await openDB();

    // Start with only what the user has actually uploaded — no sample/demo documents.
    documents = await getAllDocuments();

    syncDocumentMetadata();
    populateVehicleOptions();
    render();
}

function getVehicles(){
    try{
        const saved=JSON.parse(localStorage.getItem("autonexus_vehicles"));
        return Array.isArray(saved) ? saved : [];
    }catch{return [];}
}

function populateVehicleOptions(){
    const vehicles=getVehicles();
    const filter=document.getElementById("vehicleFilter");
    const select=document.getElementById("documentVehicle");
    const currentFilter=filter.value;
    const currentVehicle=select.value;
    filter.innerHTML='<option value="all">All Vehicles</option>'+vehicles.map(v=>`<option value="${escapeHTML(v.name)}">${escapeHTML(v.name)}</option>`).join('');
    if(vehicles.some(v=>v.name===currentFilter)) filter.value=currentFilter;
    select.innerHTML=vehicles.length ? vehicles.map(v=>`<option value="${escapeHTML(v.name)}">${escapeHTML(v.name)}${v.number?` - ${escapeHTML(v.number)}`:''}</option>`).join('') : '<option value="">Add a vehicle first</option>';
    if(vehicles.some(v=>v.name===currentVehicle)) select.value=currentVehicle;
}

/* =========================
   RENDER DOCUMENTS
========================= */
function render(){
    const container = document.getElementById("documentContainer");
    const query = document.getElementById("documentSearch").value
        .trim().toLowerCase();

    const category = document.getElementById("categoryFilter").value;
    const vehicle = document.getElementById("vehicleFilter").value;

    const filtered = documents.filter(document=>{
        const matchesSearch =
            document.name.toLowerCase().includes(query) ||
            document.vehicle.toLowerCase().includes(query) ||
            document.fileName.toLowerCase().includes(query);

        const matchesCategory =
            category === "all" || document.category === category;

        const matchesVehicle =
            vehicle === "all" || document.vehicle === vehicle;

        return matchesSearch && matchesCategory && matchesVehicle;
    });

    if(filtered.length === 0){
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <h3>No documents found</h3>
                <p>Try another filter or upload a new document.</p>
            </div>
        `;
    }else{
        container.innerHTML = filtered.map(document=>{
            const status = expiryStatus(document.expiry);

            return `
                <article class="document-card">
                    <div class="document-top">
                        <div class="document-icon">
                            <i class="fas ${iconFor(document.category)}"></i>
                        </div>
                        <span class="document-type">
                            ${escapeHTML(document.category)}
                        </span>
                    </div>

                    <h3>${escapeHTML(document.name)}</h3>
                    <p class="vehicle">
                        <i class="fas fa-car"></i>
                        ${escapeHTML(document.vehicle)}
                    </p>

                    <div class="document-info">
                        <div class="info-box">
                            <span>Issue Date</span>
                            <strong>${formatDate(document.issue)}</strong>
                        </div>

                        <div class="info-box">
                            <span>Expiry</span>
                            <strong class="${status.className}">
                                ${status.text}
                            </strong>
                        </div>

                        <div class="info-box">
                            <span>File</span>
                            <strong>${escapeHTML(document.fileName)}</strong>
                        </div>

                        <div class="info-box">
                            <span>Size</span>
                            <strong>${formatSize(document.size)}</strong>
                        </div>
                    </div>

                    <div class="document-actions">
                        <button onclick="viewDocument(${document.id})">
                            <i class="fas fa-eye"></i> View
                        </button>

                        <button onclick="downloadDocument(${document.id})">
                            <i class="fas fa-download"></i> Download
                        </button>

                        <button onclick="editDocument(${document.id})">
                            <i class="fas fa-pen"></i> Edit
                        </button>

                        <button class="delete"
                                onclick="removeDocument(${document.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </article>
            `;
        }).join("");
    }

    updateStats();
    renderExpiry();
}

/* =========================
   STATS
========================= */
function updateStats(){
    const valid = documents.filter(d=>{
        const days = daysUntil(d.expiry);
        return days === null || days > 30;
    }).length;

    const expiring = documents.filter(d=>{
        const days = daysUntil(d.expiry);
        return days !== null && days >= 0 && days <= 30;
    }).length;

    const storage = documents.reduce(
        (total,d)=>total+(Number(d.size)||0),0
    );

    const storageMB = storage/(1024*1024);

    document.getElementById("documentCount").textContent = documents.length;
    document.getElementById("validCount").textContent = valid;
    document.getElementById("expiryCount").textContent = expiring;
    document.getElementById("storageCount").textContent =
        storageMB < 1 ? `${Math.round(storage/1024)} KB` :
        `${storageMB.toFixed(1)} MB`;

    document.getElementById("storageText").textContent =
        `${storageMB.toFixed(1)} MB used`;

    document.getElementById("storageBar").style.width =
        `${Math.min(storageMB,100)}%`;
}

/* =========================
   EXPIRY LIST
========================= */
function renderExpiry(){
    const list = document.getElementById("expiryList");

    const upcoming = documents
        .filter(d=>{
            const days = daysUntil(d.expiry);
            return days !== null && days >= 0 && days <= 90;
        })
        .sort((a,b)=>daysUntil(a.expiry)-daysUntil(b.expiry))
        .slice(0,4);

    if(upcoming.length === 0){
        list.innerHTML = `
            <div class="expiry-row">
                <div class="expiry-icon">
                    <i class="fas fa-check"></i>
                </div>
                <div>
                    <strong>No upcoming expiries</strong>
                    <p>Your documents are up to date.</p>
                </div>
            </div>
        `;
        return;
    }

    list.innerHTML = upcoming.map(d=>{
        const days = daysUntil(d.expiry);

        return `
            <div class="expiry-row">
                <div class="expiry-icon">
                    <i class="fas ${iconFor(d.category)}"></i>
                </div>
                <div>
                    <strong>${escapeHTML(d.name)}</strong>
                    <p>${escapeHTML(d.vehicle)} • ${formatDate(d.expiry)}</p>
                </div>
                <span class="expiry-badge">
                    ${days === 0 ? "Today" : `${days} days`}
                </span>
            </div>
        `;
    }).join("");
}

/* =========================
   UPLOAD MODAL
========================= */
let editingDocumentId=null;

function editDocument(id){
    const doc=documents.find(d=>d.id===id);
    if(!doc) return;
    editingDocumentId=id;
    document.getElementById("documentModalTitle").textContent="Edit Document";
    document.getElementById("documentName").value=doc.name||"";
    document.getElementById("documentCategory").value=doc.category||"Other";
    populateVehicleOptions();
    document.getElementById("documentVehicle").value=doc.vehicle||"";
    document.getElementById("issueDate").value=doc.issue||"";
    document.getElementById("expiryDate").value=doc.expiry||"";
    document.getElementById("documentFile").required=false;
    document.getElementById("fileName").textContent=doc.fileName||"Keep existing file";
    uploadModal.classList.add("show");
}

const uploadModal = document.getElementById("uploadModal");
const uploadForm = document.getElementById("documentForm");
const fileInput = document.getElementById("documentFile");
const fileDrop = document.getElementById("fileDrop");
const fileName = document.getElementById("fileName");

document.getElementById("uploadBtn").addEventListener("click",()=>{
    uploadModal.classList.add("show");
});

document.getElementById("closeModal").addEventListener("click",()=>{
    closeUploadModal();
});

uploadModal.addEventListener("click",e=>{
    if(e.target === uploadModal) closeUploadModal();
});

function closeUploadModal(){
    uploadModal.classList.remove("show");
    uploadForm.reset();
    selectedFile = null;
    editingDocumentId=null;
    document.getElementById("documentModalTitle").textContent="Upload Document";
    document.getElementById("documentFile").required=true;
    fileName.textContent = "Choose a file";
    populateVehicleOptions();
}

fileDrop.addEventListener("click",()=>{
    fileInput.click();
});

fileInput.addEventListener("change",()=>{
    if(fileInput.files.length){
        handleFile(fileInput.files[0]);
    }
});

fileDrop.addEventListener("dragover",e=>{
    e.preventDefault();
    fileDrop.classList.add("dragover");
});

fileDrop.addEventListener("dragleave",()=>{
    fileDrop.classList.remove("dragover");
});

fileDrop.addEventListener("drop",e=>{
    e.preventDefault();
    fileDrop.classList.remove("dragover");

    const file = e.dataTransfer.files[0];
    if(file) handleFile(file);
});

function handleFile(file){
    const allowed = [
        "application/pdf",
        "image/jpeg",
        "image/png"
    ];

    if(!allowed.includes(file.type)){
        showDocumentToast("Only PDF, JPG, JPEG and PNG files are allowed.",true);
        return;
    }

    if(file.size > 10*1024*1024){
        showDocumentToast("File must be smaller than 10 MB.",true);
        return;
    }

    selectedFile = file;
    fileName.textContent = file.name;

    if(!document.getElementById("documentName").value){
        document.getElementById("documentName").value =
            file.name.replace(/\.[^/.]+$/,"");
    }
}

uploadForm.addEventListener("submit",async e=>{
    e.preventDefault();
    const existing=editingDocumentId ? documents.find(d=>String(d.id)===String(editingDocumentId)) : null;
    if(!existing && !selectedFile){
        showDocumentToast("Please select a document.",true);
        return;
    }
    const newDocument = {
        id: editingDocumentId || Date.now(),
        name:document.getElementById("documentName").value.trim(),
        category:document.getElementById("documentCategory").value,
        vehicle:document.getElementById("documentVehicle").value,
        issue:document.getElementById("issueDate").value,
        expiry:document.getElementById("expiryDate").value,
        fileName:selectedFile ? selectedFile.name : existing.fileName,
        fileType:selectedFile ? selectedFile.type : existing.fileType,
        size:selectedFile ? selectedFile.size : existing.size,
        fileBlob:selectedFile || existing.fileBlob
    };
    try{
        await putDocument(newDocument);
        documents=await getAllDocuments();
        syncDocumentMetadata();
        closeUploadModal();
        render();
        showDocumentToast(editingDocumentId?"Document updated successfully.":"Document uploaded successfully.");
    }catch(error){
        console.error(error);
        showDocumentToast("Unable to save the document.",true);
    }
});

function showDocumentToast(message,error=false){
    let toast=document.getElementById("documentToast");
    if(!toast){toast=document.createElement("div");toast.id="documentToast";toast.style.cssText="position:fixed;right:24px;bottom:24px;z-index:100000;padding:13px 18px;border-radius:10px;background:var(--card,#111827);color:var(--text,#fff);box-shadow:0 12px 35px rgba(0,0,0,.25);border:1px solid var(--border,rgba(255,255,255,.12))";document.body.appendChild(toast);}
    toast.textContent=message;toast.style.borderColor=error?"#ef4444":"var(--border,rgba(255,255,255,.12))";clearTimeout(showDocumentToast.timer);showDocumentToast.timer=setTimeout(()=>toast.remove(),2500);
}

/* =========================
   VIEW DOCUMENT
========================= */
async function viewDocument(id){
    // NOTE: this local var must NOT be named "document" - that shadows
    // the global window.document for the rest of this function, which
    // is why document.getElementById(...) below used to silently break
    // the View button (it was calling getElementById on the doc record,
    // not on the page).
    const doc = documents.find(d=>d.id===id);
    if(!doc) return;

    const previewModal = document.getElementById("previewModal");
    const area = document.getElementById("previewArea");

    area.innerHTML = `
        <div class="preview-message">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading document...</p>
        </div>
    `;

    previewModal.classList.add("show");

    if(!doc.fileBlob){
        area.innerHTML = `
            <div class="preview-message">
                <i class="fas fa-file-circle-question"></i>
                <h3>Preview unavailable</h3>
                <p>This sample document has no attached file.</p>
                <button class="primary-btn"
                        onclick="downloadDocument(${doc.id})">
                    Download
                </button>
            </div>
        `;
        return;
    }

    const url = URL.createObjectURL(doc.fileBlob);

    if(doc.fileType === "application/pdf"){
        area.innerHTML = `<iframe src="${url}"></iframe>`;
    }else if(doc.fileType.startsWith("image/")){
        area.innerHTML = `<img src="${url}" alt="Document preview">`;
    }else{
        area.innerHTML = `
            <div class="preview-message">
                <i class="fas fa-file"></i>
                <p>Preview is not available for this file type.</p>
            </div>
        `;
    }

    previewModal.dataset.url = url;
}

document.getElementById("closePreview").addEventListener("click",closePreview);

document.getElementById("previewModal").addEventListener("click",e=>{
    if(e.target.id === "previewModal") closePreview();
});

function closePreview(){
    const previewModal = document.getElementById("previewModal");
    const url = previewModal.dataset.url;

    if(url) URL.revokeObjectURL(url);

    previewModal.removeAttribute("data-url");
    previewModal.classList.remove("show");
    document.getElementById("previewArea").innerHTML = "";
}

/* =========================
   DOWNLOAD
========================= */
function downloadDocument(id){
    const doc = documents.find(d=>d.id===id);

    if(!doc) return;

    if(!doc.fileBlob){
        showDocumentToast("This document has no stored file. Upload the real document first.",true);
        return;
    }

    const url = URL.createObjectURL(doc.fileBlob);
    const link = document.createElement("a");

    link.href = url;
    link.download = doc.fileName;
    link.click();

    setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/* =========================
   DELETE
========================= */
async function removeDocument(id){
    const doc = documents.find(d=>d.id===id);

    if(!doc) return;

    const confirmDelete = confirm(
        `Delete "${doc.name}" from your document locker?`
    );

    if(!confirmDelete) return;

    await deleteDocumentFromDB(id);
    documents = await getAllDocuments();
    syncDocumentMetadata();
    render();
}

/* =========================
   SEARCH / FILTER
========================= */
document.getElementById("documentSearch")
    .addEventListener("input",render);

document.getElementById("categoryFilter")
    .addEventListener("change",render);

document.getElementById("vehicleFilter")
    .addEventListener("change",render);

window.addEventListener("autonexus:data-updated",()=>{
    populateVehicleOptions();
    render();
});

/* =========================
   NOTIFICATIONS
========================= */
/* =========================
   START
========================= */
initialize().catch(error=>{
    console.error(error);
    showDocumentToast("Unable to load the document locker.",true);
});
