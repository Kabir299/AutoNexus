const CONTACTS_KEY = "autonexus_emergency_contacts";
const HISTORY_KEY = "autonexus_sos_history";

let contacts = JSON.parse(localStorage.getItem(CONTACTS_KEY)) || [
    {
        id:1,
        name:"Emergency Contact",
        phone:"",
        relation:"Family"
    }
];

let history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
let currentLocation = null;
let selectedService = "General Roadside Assistance";
let activeRequest = null;

function saveContacts(){
    localStorage.setItem(CONTACTS_KEY,JSON.stringify(contacts));
}

function saveHistory(){
    localStorage.setItem(HISTORY_KEY,JSON.stringify(history));
}

function escapeHTML(value){
    return String(value).replace(/[&<>"']/g,char=>({
        "&":"&amp;",
        "<":"&lt;",
        ">":"&gt;",
        '"':"&quot;",
        "'":"&#039;"
    }[char]));
}

/* SOS */

const sosModal = document.getElementById("sosModal");

document.getElementById("mainSosBtn").addEventListener("click",()=>{
    document.getElementById("sosType").value = selectedService;
    sosModal.classList.add("show");
});

document.getElementById("closeSos").addEventListener("click",closeSos);
document.getElementById("cancelSos").addEventListener("click",closeSos);

sosModal.addEventListener("click",e=>{
    if(e.target===sosModal) closeSos();
});

function closeSos(){
    sosModal.classList.remove("show");
}

document.getElementById("confirmSos").addEventListener("click",()=>{
    const type = document.getElementById("sosType").value;
    const details = document.getElementById("sosDetails").value.trim();

    const selectedVehicle=getSelectedVehicle();
    if(!selectedVehicle){showSosToast("Add/select a vehicle before creating SOS.",true);return;}
    activeRequest = {
        id:Date.now(),
        type,
        details,
        vehicleId:selectedVehicle.id,
        vehicleName:selectedVehicle.name,
        vehicleNumber:selectedVehicle.number||"",
        time:new Date().toISOString(),
        location:currentLocation
    };

    history.unshift(activeRequest);
    saveHistory();

    closeSos();
    updateAssistanceStatus();
    renderHistory();

    showSosToast("SOS request created successfully.");

    document.getElementById("sosDetails").value = "";
});

/* SERVICE SELECTORS */

document.querySelectorAll(".service-card").forEach(card=>{
    card.addEventListener("click",()=>{
        document.querySelectorAll(".service-card")
            .forEach(c=>c.classList.remove("selected"));

        card.classList.add("selected");
        selectedService = card.dataset.service;

        document.getElementById("sosType").value = selectedService;
        sosModal.classList.add("show");
    });
});

/* LOCATION */

document.getElementById("locationBtn")
    .addEventListener("click",detectLocation);

document.getElementById("shareLocationBtn")
    .addEventListener("click",shareLocation);

function detectLocation(){
    const status = document.getElementById("locationStatus");
    const coords = document.getElementById("coordinates");

    status.textContent = "Detecting...";
    coords.textContent = "Requesting browser location permission...";

    if(!navigator.geolocation){
        status.textContent = "Unavailable";
        coords.textContent = "Geolocation is not supported by this browser.";
        return;
    }

    // Explicit user action on the SOS page - force a fresh read so the
    // shared location the user shares is accurate, and cache it so
    // other pages don't have to ask again right after.
    window.AutoNexusLocation.getUserLocation({force:true}).then(({lat,lng,accuracy})=>{
        currentLocation = {
            latitude:lat,
            longitude:lng,
            accuracy:accuracy
        };

        status.textContent = "Location available";

        coords.textContent =
            `${currentLocation.latitude.toFixed(5)}, ` +
            `${currentLocation.longitude.toFixed(5)} ` +
            `• ±${Math.round(currentLocation.accuracy)}m`;

        document.getElementById("shareStatus").textContent =
            "Ready to share";

        // Put the SAME location detected by the existing SOS page
        // onto the real map.
        updateRealMapLocation();
    }).catch(()=>{
        currentLocation = null;
        status.textContent = "Permission denied";
        coords.textContent = "Allow location access to share your position.";
    });
}

async function shareLocation(){
    if(!currentLocation){
        detectLocation();

        setTimeout(()=>{
            if(currentLocation) shareLocation();
        },1500);

        return;
    }

    const text =
        `My AutoNexus location: ` +
        `${currentLocation.latitude.toFixed(5)}, ` +
        `${currentLocation.longitude.toFixed(5)}`;

    if(navigator.share){
        try{
            await navigator.share({
                title:"AutoNexus Emergency Location",
                text
            });

            document.getElementById("shareStatus").textContent =
                "Location shared";
        }catch(error){}
    }else if(navigator.clipboard){
        await navigator.clipboard.writeText(text);

        document.getElementById("shareStatus").textContent =
            "Location copied";

        alert("Location details copied to your clipboard.");
    }else{
        alert(text);
    }
}

/* REAL LEAFLET MAP */

let sosMap = null;
let sosMapMarker = null;
let sosAccuracyCircle = null;

function initializeRealMap(){

    if(typeof L === "undefined"){
        console.error(
            "Leaflet did not load. Check your internet connection."
        );
        return;
    }

    const mapElement = document.getElementById("map");

    if(!mapElement){
        console.error("Map container #map was not found.");
        return;
    }

    sosMap = L.map("map", {
        zoomControl:true
    }).setView([20.5937, 78.9629], 5);

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom:19,
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }
    ).addTo(sosMap);

    // Fix tile sizing when the map is inside a grid/card.
    setTimeout(()=>{
        sosMap.invalidateSize();
    }, 250);

    if(currentLocation){
        updateRealMapLocation();
    }
}

function updateRealMapLocation(){

    if(!sosMap || !currentLocation) return;

    const lat = currentLocation.latitude;
    const lng = currentLocation.longitude;

    const userIcon = L.divIcon({
        className:"",
        html:'<div class="user-map-marker"></div>',
        iconSize:[18,18],
        iconAnchor:[9,9]
    });

    if(!sosMapMarker){

        sosMapMarker = L.marker(
            [lat,lng],
            {icon:userIcon}
        )
        .addTo(sosMap)
        .bindPopup("<strong>Your current location</strong>");

    }else{

        sosMapMarker.setLatLng([lat,lng]);
    }

    if(sosAccuracyCircle){

        sosAccuracyCircle.setLatLng([lat,lng]);
        sosAccuracyCircle.setRadius(currentLocation.accuracy);

    }else{

        sosAccuracyCircle = L.circle(
            [lat,lng],
            {
                radius:currentLocation.accuracy,
                color:"#ff5c67",
                fillColor:"#ff5c67",
                fillOpacity:.08,
                weight:1
            }
        ).addTo(sosMap);
    }

    sosMap.flyTo(
        [lat,lng],
        16,
        {duration:0.8}
    );
}

/* Initialize after Leaflet and the page are loaded. */
window.addEventListener("load", ()=>{
    initializeRealMap();
});

/* ASSISTANCE STATUS */

function updateAssistanceStatus(){
    const status = document.getElementById("assistanceStatus");
    const subtext = document.getElementById("assistanceSubtext");
    const cancel = document.getElementById("cancelBtn");

    if(activeRequest){
        status.textContent = "Request Active";
        status.style.color = "#ffd05a";
        subtext.textContent = `${activeRequest.type} • Waiting for response`;
        cancel.disabled = false;
    }else{
        status.textContent = "Ready";
        status.style.color = "#39d6b6";
        subtext.textContent = "No active request";
        cancel.disabled = true;
    }
}

document.getElementById("cancelBtn").addEventListener("click",()=>{
    if(!activeRequest) return;

    if(!confirm("Cancel the current SOS request?")) return;

    activeRequest = null;
    updateAssistanceStatus();
    showSosToast("SOS request cancelled.");
});

/* VEHICLE */

function getVehicles(){try{const db=window.AutoNexusSync.getDB();return Array.isArray(db.vehicles)?db.vehicles:[]}catch{return []}}
function getSelectedVehicle(){const vs=getVehicles();return window.AutoNexusSync.getActiveVehicle(vs)}
function renderSelectedVehicle(){const v=getSelectedVehicle(),el=document.getElementById("vehicleName");el.textContent=v?v.name+(v.number?` • ${v.number}`:""):"No vehicle selected"}
document.getElementById("vehicleBtn").addEventListener("click",()=>{
    const vs=getVehicles();
    if(!vs.length){showSosToast("Add a vehicle on My Vehicles first.",true);return;}
    let modal=document.getElementById("sosVehicleModal");
    if(!modal){modal=document.createElement("div");modal.id="sosVehicleModal";modal.className="modal";document.body.appendChild(modal)}
    const selected=getSelectedVehicle();
    modal.innerHTML=`<div class="modal-content small"><button class="close" type="button" onclick="closeSosVehicleModal()">&times;</button><span class="section-label">SOS VEHICLE</span><h2>Select Vehicle</h2><p class="modal-subtitle">Choose the real vehicle for this emergency request.</p><select id="sosVehicleSelect">${vs.map(v=>`<option value="${escapeHTML(v.id)}" ${selected&&String(selected.id)===String(v.id)?"selected":""}>${escapeHTML(v.name||"Vehicle")} — ${escapeHTML(v.number||"No registration")}</option>`).join("")}</select><button class="primary-btn" type="button" onclick="saveSosVehicleSelection()">Use This Vehicle</button></div>`;modal.classList.add("show");
});
function saveSosVehicleSelection(){const id=document.getElementById("sosVehicleSelect").value;const vs=getVehicles();window.AutoNexusSync.setActiveVehicle(vs,id);const db=window.AutoNexusSync.getDB();db.vehicles=vs;window.AutoNexusSync.saveDB(db);closeSosVehicleModal();renderSelectedVehicle()}
function closeSosVehicleModal(){const m=document.getElementById("sosVehicleModal");if(m)m.classList.remove("show")}
function showSosToast(message,error=false){let t=document.getElementById("sosToast");if(!t){t=document.createElement("div");t.id="sosToast";t.style.cssText="position:fixed;right:24px;bottom:24px;z-index:100000;padding:13px 18px;border-radius:10px;background:#111827;color:#fff";document.body.appendChild(t)}t.textContent=message;t.style.border=error?"1px solid #ef4444":"1px solid rgba(255,255,255,.12)";clearTimeout(showSosToast.timer);showSosToast.timer=setTimeout(()=>t.remove(),2500)}
renderSelectedVehicle();
window.addEventListener("autonexus:data-updated",renderSelectedVehicle);

/* CONTACTS */

const contactModal = document.getElementById("contactModal");

document.getElementById("addContactBtn")
    .addEventListener("click",()=>{
        document.getElementById("contactForm").reset();
        contactModal.classList.add("show");
    });

document.getElementById("closeContact")
    .addEventListener("click",()=>{
        contactModal.classList.remove("show");
    });

contactModal.addEventListener("click",e=>{
    if(e.target===contactModal){
        contactModal.classList.remove("show");
    }
});

document.getElementById("contactForm").addEventListener("submit",e=>{
    e.preventDefault();

    contacts.push({
        id:Date.now(),
        name:document.getElementById("contactName").value.trim(),
        phone:document.getElementById("contactPhone").value.trim(),
        relation:document.getElementById("contactRelation").value.trim()
    });

    saveContacts();
    renderContacts();

    contactModal.classList.remove("show");
    e.target.reset();
});

function renderContacts(){
    const container = document.getElementById("contactsList");

    if(!contacts.length){
        container.innerHTML = `
            <div class="empty-contact">
                No emergency contacts added yet.
            </div>
        `;
        return;
    }

    container.innerHTML = contacts.map(contact=>`
        <div class="contact-row">
            <div class="contact-avatar">
                <i class="fas fa-user"></i>
            </div>

            <div class="contact-info">
                <strong>${escapeHTML(contact.name)}</strong>
                <span>
                    ${escapeHTML(contact.relation)}
                    ${contact.phone ? ` • ${escapeHTML(contact.phone)}` : ""}
                </span>
            </div>

            <div class="contact-actions">
                ${
                    contact.phone
                    ? `<button onclick="callContact('${escapeHTML(contact.phone)}')"
                              title="Call">
                            <i class="fas fa-phone"></i>
                       </button>`
                    : ""
                }

                <button class="remove"
                        onclick="removeContact(${contact.id})"
                        title="Remove">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join("");
}

function callContact(phone){
    window.location.href = `tel:${phone}`;
}

function removeContact(id){
    contacts = contacts.filter(contact=>contact.id!==id);
    saveContacts();
    renderContacts();
}

/* HISTORY */

function renderHistory(){
    const container = document.getElementById("historyList");

    if(!history.length){
        container.innerHTML = `
            <div class="empty-contact">
                No SOS requests yet.
            </div>
        `;
        return;
    }

    container.innerHTML = history.slice(0,5).map(item=>{
        const date = new Date(item.time);

        return `
            <div class="history-row">
                <div class="history-icon">
                    <i class="fas fa-location-crosshairs"></i>
                </div>

                <div class="history-info">
                    <strong>${escapeHTML(item.type)}</strong>
                    <span>
                        ${date.toLocaleDateString("en-IN")} •
                        ${date.toLocaleTimeString("en-IN",{
                            hour:"2-digit",
                            minute:"2-digit"
                        })}
                    </span>
                </div>

                <span class="history-status">Requested</span>

                <button class="remove-history"
                        onclick="deleteSosRequest(${item.id})"
                        title="Delete request">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }).join("");
}

function deleteSosRequest(id){
    const request = history.find(item=>item.id===id);
    if(!request) return;

    if(!confirm("Delete this SOS request from your history?")) return;

    history = history.filter(item=>item.id!==id);
    saveHistory();

    if(activeRequest && activeRequest.id===id){
        activeRequest = null;
        updateAssistanceStatus();
    }

    renderHistory();
}

// NOTE: the notification bell badge is handled globally by
// autonexus-sync.js's shared notification system. This page used to keep
// its own separate count based on SOS history length and overwrite the
// badge with that, which is why it could show a number unrelated to
// your actual notifications.

/* LOGOUT */

function logout(){
    localStorage.removeItem("loggedInUser");
    sessionStorage.removeItem("loggedInUser");
    window.location.href="../login.html";
}

renderContacts();
renderHistory();
updateAssistanceStatus();
