const DB_KEY = "autonexus_database";
const NEW_VEHICLES_KEY = "autonexus_vehicles";
const NEW_BOOKINGS_KEY = "autonexus_bookings";
const NEW_REMINDERS_KEY = "autonexus_reminders";
// BUGFIX: chat history is now namespaced per logged-in account (see
// ai-assistant.js) so different users on the same browser don't see each
// other's AI Assistant conversation. The dashboard's live-sync watcher
// needs to watch that same per-user key, not the old flat one.
function currentAiChatKey(){
    const uid = window.AutoNexusSync && window.AutoNexusSync.getCurrentUserId ? window.AutoNexusSync.getCurrentUserId() : null;
    return uid ? `autonexus_ai_chat:${uid}` : "autonexus_ai_chat:guest";
}
const AI_CHAT_KEY = currentAiChatKey();
// Unified with the Emergency SOS page's request history so the SOS count
// shown here always matches the SOS page.
const SOS_KEY = "autonexus_sos_history";

const DEFAULT_DB = {
    vehicles:[],
    documents:[],
    bookings:[],
    reminders:[],
    notifications:[],
    mechanics:[],
    services:[],
    expenses:[],
    fuelLogs:[],
    activities:[],
    sosEvents:[],
    settings:{
        theme:"dark",
        currency:"₹",
        autoBackup:true,
        animations:true
    }
};

let db = loadJSON(DB_KEY, null) || DEFAULT_DB;
normalizeDB();

let dashboardMap = null;
let userMarker = null;
let mechanicMarkers = [];
let currentLocation = null;
let lastSnapshot = "";

function loadJSON(key,fallback){
    try{
        const value = localStorage.getItem(key);
        return value === null ? fallback : JSON.parse(value);
    }catch{
        return fallback;
    }
}

function saveDB(){
    localStorage.setItem(DB_KEY,JSON.stringify(db));
}


function normalizeDB(){
    const arrays = [
        "vehicles","documents","bookings","reminders",
        "notifications","mechanics","services","expenses",
        "fuelLogs","activities","sosEvents"
    ];

    arrays.forEach(key=>{
        if(!Array.isArray(db[key])) db[key]=[];
    });

    if(!db.settings) db.settings=DEFAULT_DB.settings;

    saveDB();
}

/* AUTH */

function setupUser(){
    const user =
        loadJSON("loggedInUser",null) ||
        loadJSON("sessionUser",null);

    if(user && user.name){
        document.getElementById("userName").textContent = user.name;
    }
}

function logout(){
    localStorage.removeItem("loggedInUser");
    sessionStorage.removeItem("loggedInUser");
    go("login.html");
}

function go(page){
    window.location.href=page;
}

/* DATE */

function daysRemaining(date){
    if(!date) return Infinity;

    const target = new Date(date+"T23:59:59");
    const today = new Date();

    return Math.ceil(
        (target.getTime()-today.getTime()) /
        (1000*60*60*24)
    );
}

function formatDate(date){
    if(!date) return "--";

    const parsed = new Date(date.includes("T") ? date : date+"T00:00:00");

    if(Number.isNaN(parsed.getTime())) return date;

    return parsed.toLocaleDateString("en-IN",{
        day:"2-digit",
        month:"short",
        year:"numeric"
    });
}

/* DASHBOARD */

function refreshDashboard(){

    /*
        Re-read the database every cycle so changes made by
        another AutoNexus page are reflected here.
    */
    const latest = loadJSON(DB_KEY,null);

    if(latest){
        db=latest;
        normalizeDB();
    }

    setupUser();
    renderStatistics();
    renderHeroVehicle();
    renderHealth();
    renderReminders();
    renderBookings();
    renderDocuments();
    buildNotifications();
    updateClock();
}

function renderStatistics(){

    document.getElementById("vehicleCount").textContent =
        db.vehicles.length;

    document.getElementById("documentCount").textContent =
        db.documents.length;

    const pending =
        db.bookings.filter(b=>
            ["Pending","Confirmed"].includes(b.status)
        ).length;

    document.getElementById("bookingCount").textContent =
        db.bookings.length;

    document.getElementById("bookingSub").textContent =
        `${pending} active`;

    // Keep this number identical to the Reminders page total.
    document.getElementById("reminderCount").textContent =
        db.reminders.length;

    document.getElementById("sosCount").textContent =
        db.sosEvents.length;
}

function renderHeroVehicle(){

    const switcher = document.getElementById("activeVehicleSelect");

    if(!db.vehicles.length){

        switcher.style.display = "none";
        switcher.innerHTML = "";

        document.getElementById("heroName").textContent =
            "No Vehicle Added";

        document.getElementById("heroNumber").textContent =
            "------";

        document.getElementById("heroFuel").textContent =
            "Fuel: --";

        document.getElementById("heroInsurance").textContent =
            "Insurance: --";

        document.getElementById("heroHealth").textContent =
            "Health: --";

        return;
    }

    const active = window.AutoNexusSync.getActiveVehicle(db.vehicles);

    // Let the person pick which vehicle is "active" right from the
    // dashboard — this is the same vehicle shown on My Vehicles and the
    // AI Assistant page.
    if(db.vehicles.length > 1){
        switcher.style.display = "";
        switcher.innerHTML = db.vehicles.map(v=>`
            <option value="${v.id}" ${String(v.id)===String(active.id) ? "selected" : ""}>
                ${escapeHTML(v.name || "Vehicle")} ${v.number ? "• "+escapeHTML(v.number) : ""}
            </option>
        `).join("");
    }else{
        switcher.style.display = "none";
        switcher.innerHTML = "";
    }

    document.getElementById("heroName").textContent =
        active.name || "Vehicle";

    document.getElementById("heroNumber").textContent =
        active.number || "------";

    document.getElementById("heroFuel").textContent =
        `Fuel: ${active.fuel || "--"}`;

    const insuranceDays =
        daysRemaining(active.insurance);

    document.getElementById("heroInsurance").textContent =
        insuranceDays===Infinity
            ? "Insurance: --"
            : `Insurance: ${insuranceDays}d`;

    document.getElementById("heroHealth").textContent =
        `Health: ${window.AutoNexusSync.computeVehicleHealth(active).overall}%`;
}

document.getElementById("activeVehicleSelect")
    .addEventListener("change",event=>{
        window.AutoNexusSync.setActiveVehicle(db.vehicles,event.target.value);
        saveDB();
        refreshDashboard();
    });

/* HEALTH */

// Health is computed for the currently ACTIVE vehicle only (from its own
// last-service/tyre/brake/battery dates), using the same shared formula
// as My Vehicles and the AI Assistant page — see autonexus-sync.js.
function calculateVehicleHealth(){
    if(!db.vehicles.length) return 0;
    const active = window.AutoNexusSync.getActiveVehicle(db.vehicles);
    return window.AutoNexusSync.computeVehicleHealth(active).overall;
}

function setHealth(id,value){
    document.getElementById(id+"HealthText").textContent =
        `${value}%`;

    document.getElementById(id+"HealthBar").style.width =
        `${value}%`;
}

function renderHealth(){

    if(!db.vehicles.length){
        document.getElementById("healthScore").textContent = "--%";
        setHealth("engine",0);
        setHealth("battery",0);
        setHealth("tyre",0);
        setHealth("brake",0);
        return;
    }

    const active = window.AutoNexusSync.getActiveVehicle(db.vehicles);
    const health = window.AutoNexusSync.computeVehicleHealth(active);

    document.getElementById("healthScore").textContent =
        `${health.overall}%`;

    setHealth("engine",health.engine);
    setHealth("battery",health.battery);
    setHealth("tyre",health.tyre);
    setHealth("brake",health.brake);
}

/* REMINDERS */

function renderReminders(){

    const container =
        document.getElementById("remindersList");

    // Only ever show reminders the person actually created on the
    // Reminders page — no auto-generated insurance renewal entries.
    let items = [
        ...db.reminders.filter(r=>!r.completed).map(r=>({
            title:r.title || "Reminder",
            sub:`${r.category || "Vehicle"} • ${r.vehicle || ""}`,
            date:r.date,
            type:"reminder"
        }))
    ];

    items.sort((a,b)=>
        new Date(a.date||"9999-12-31") -
        new Date(b.date||"9999-12-31")
    );

    items = items.slice(0,5);

    if(!items.length){
        container.innerHTML =
            `<div class="empty">
                <i class="fas fa-circle-check"></i><br>
                No upcoming reminders.
             </div>`;
        return;
    }

    container.innerHTML = items.map(item=>{

        const days = daysRemaining(item.date);

        const status =
            days<0 ? "danger" :
            days<=7 ? "warning" : "good";

        const label =
            days<0 ? "Expired" :
            days===0 ? "Today" :
            `${days}d left`;

        return `
            <div class="list-item">
                <div class="list-icon">
                    <i class="fas ${item.type==="insurance"
                        ? "fa-shield-halved"
                        : "fa-calendar-check"}"></i>
                </div>
                <div class="list-copy">
                    <strong>${escapeHTML(item.title)}</strong>
                    <span>${escapeHTML(item.sub || "")} • ${formatDate(item.date)}</span>
                </div>
                <span class="badge-status ${status}">${label}</span>
            </div>
        `;
    }).join("");
}

/* BOOKINGS */

function renderBookings(){

    const tbody =
        document.getElementById("bookingTable");

    const list =
        [...db.bookings]
        .sort((a,b)=>
            new Date(b.date||0)-new Date(a.date||0)
        )
        .slice(0,6);

    if(!list.length){
        tbody.innerHTML =
            `<tr><td colspan="5" class="empty">No mechanic bookings yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(booking=>`
        <tr>
            <td><strong>${escapeHTML(booking.mechanic || "Mechanic")}</strong></td>
            <td>${escapeHTML(booking.vehicle || "--")}</td>
            <td>${formatDate(booking.date)}</td>
            <td>
                <span class="status-badge ${(booking.status||"Pending").toLowerCase()}">
                    ${escapeHTML(booking.status || "Pending")}
                </span>
            </td>
            <td>
                <button class="row-delete-btn" title="Delete booking"
                        onclick="deleteBooking(${booking.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join("");
}

function deleteBooking(id){
    const booking = db.bookings.find(b=>b.id===id);
    if(!booking) return;

    if(!confirm(`Delete the booking with ${booking.mechanic || "this mechanic"}?`)) return;

    db.bookings = db.bookings.filter(b=>b.id!==id);
    saveDB();
    refreshDashboard();
}

/* DOCUMENTS */

function renderDocuments(){

    const container =
        document.getElementById("documentsList");

    const docs =
        db.documents.slice(0,5);

    if(!docs.length){

        container.innerHTML = `
            <div class="list-item">
                <div class="list-icon">
                    <i class="fas fa-folder-open"></i>
                </div>
                <div class="list-copy">
                    <strong>No tracked documents</strong>
                    <span>Open Documents to add or manage papers.</span>
                </div>
                <button class="text-link" onclick="go('documents-page/documents.html')">
                    Open
                </button>
            </div>
        `;

        return;
    }

    container.innerHTML = docs.map(doc=>{

        const date =
            doc.expiry ||
            doc.expiryDate ||
            doc.date;

        const days = daysRemaining(date);

        let status="good";
        let label=doc.status || "Valid";

        if(days<=30){
            status=days<0 ? "danger" : "warning";
            label=days<0 ? "Expired" : `${days}d left`;
        }

        return `
            <div class="list-item">
                <div class="list-icon">
                    <i class="fas fa-file-lines"></i>
                </div>
                <div class="list-copy">
                    <strong>${escapeHTML(doc.name || doc.title || "Document")}</strong>
                    <span>${date ? formatDate(date) : "No expiry date"}</span>
                </div>
                <span class="badge-status ${status}">
                    ${escapeHTML(label)}
                </span>
            </div>
        `;
    }).join("");
}

/* NOTIFICATIONS */

function buildNotifications(){
    const notices=window.AutoNexusSync.getSharedNotifications();
    const count=document.getElementById("notificationCount");
    if(count){count.textContent=notices.length;count.style.display=notices.length?"inline-flex":"none";}
    const list=document.getElementById("notificationList");
    if(list)list.innerHTML=notices.length?notices.slice(0,20).map(n=>`<div class="notice"><strong>${escapeHTML(n.title)}</strong><p>${escapeHTML(n.type+" • "+n.detail)}</p></div>`).join(""):`<div class="empty">No notifications.</div>`;
}

/* CLOCK */

function updateClock(){

    const now = new Date();

    const value =
        now.toLocaleTimeString("en-IN",{
            hour:"2-digit",
            minute:"2-digit",
            second:"2-digit"
        });

    document.getElementById("footerTime").textContent=value;
}

/* VEHICLE MODAL */

function openVehicleModal(){
    document.getElementById("vehicleModal")
        .classList.add("show");
}

function closeVehicleModal(){
    document.getElementById("vehicleModal")
        .classList.remove("show");
}

document.getElementById("vehicleForm")
    .addEventListener("submit",event=>{

        event.preventDefault();

        const vehicle = {
            id:Date.now(),
            name:document.getElementById("vehicleName").value.trim(),
            number:document.getElementById("vehicleNumber").value.trim(),
            fuel:document.getElementById("fuelType").value,
            insurance:document.getElementById("insuranceDate").value,
            mileage:Number(document.getElementById("vehicleMileage").value) || 0,
            status:"Active",
            lastServiceDate:document.getElementById("lastServiceDate").value,
            lastServiceMileage:document.getElementById("lastServiceMileage").value
                ? Number(document.getElementById("lastServiceMileage").value)
                : "",
            tyresChangedDate:document.getElementById("tyresChangedDate").value,
            brakesChangedDate:document.getElementById("brakesChangedDate").value,
            batteryChangedDate:document.getElementById("batteryChangedDate").value,
            active:false
        };

        // Every new vehicle becomes the active one — a person adding a
        // vehicle almost always wants to see/manage it right away. They
        // can switch back with the vehicle selector.
        db.vehicles.forEach(v=>{v.active=false;});
        vehicle.active = true;

        db.vehicles.push(vehicle);

        // saveDB() writes the shared database, and autonexus-sync.js
        // automatically propagates db.vehicles out to the My Vehicles
        // page's "autonexus_vehicles" key — no separate write needed here
        // (writing it again afterwards would duplicate the vehicle).
        saveDB();

        closeVehicleModal();
        event.target.reset();
        refreshDashboard();

        showDashboardToast("Vehicle added successfully.");
    });

function showDashboardToast(message,error=false){
    let t=document.getElementById("dashboardToast");
    if(!t){t=document.createElement("div");t.id="dashboardToast";t.style.cssText="position:fixed;right:24px;bottom:24px;z-index:100000;padding:13px 18px;border-radius:10px;background:var(--card,#111827);color:var(--text,#fff);box-shadow:0 12px 35px rgba(0,0,0,.25);border:1px solid var(--border,rgba(255,255,255,.12))";document.body.appendChild(t)}
    t.textContent=message;t.style.borderColor=error?"#ef4444":"var(--border,rgba(255,255,255,.12))";clearTimeout(showDashboardToast.timer);showDashboardToast.timer=setTimeout(()=>t.remove(),2500);
}

/* SOS */

function triggerSOS(){

    if(!navigator.geolocation){

        showDashboardToast("Geolocation is not supported by this browser.",true);
        return;
    }

    // Emergency SOS always wants a precise, up-to-the-second reading,
    // so this forces a fresh GPS fix rather than reusing the cache.
    window.AutoNexusLocation.getUserLocation({
        force:true,
        geoOptions:{enableHighAccuracy:true,timeout:10000,maximumAge:0}
    }).then(
        ({lat,lng,accuracy})=>{

            // Same shape used by the Emergency SOS page's request
            // history so both pages always show the exact same events.
            const activeVehicle=window.AutoNexusSync.getActiveVehicle(db.vehicles||[]);
            const event = {
                id:Date.now(),
                type:"Quick SOS",
                vehicleId:activeVehicle?.id||null,
                vehicleName:activeVehicle?.name||"",
                vehicleNumber:activeVehicle?.number||"",
                details:"Triggered from the Dashboard quick action.",
                time:new Date().toISOString(),
                location:{
                    latitude:lat,
                    longitude:lng,
                    accuracy:accuracy
                }
            };

            const events =
                loadJSON(SOS_KEY,[]);

            events.unshift(event);

            localStorage.setItem(
                SOS_KEY,
                JSON.stringify(events)
            );

            db.sosEvents=events;

            db.notifications.unshift({
                title:"Emergency SOS",
                message:
                    `SOS location captured at ${event.location.latitude.toFixed(5)}, ${event.location.longitude.toFixed(5)}`
            });

            db.activities.unshift({
                date:new Date(event.time).toLocaleString("en-IN"),
                action:"Emergency SOS requested",
                status:"Completed"
            });

            saveDB();
            refreshDashboard();

            showDashboardToast("Emergency SOS location captured. Opening assistance...");

            go("emergency-sos-fixed-map/emergency-sos.html");
        }
    ).catch(()=>{
        showDashboardToast("Please allow location access to use Emergency SOS.",true);
    });
}

/* MAP */

function initializeMap(){

    dashboardMap =
        L.map("dashboardMap",{
            zoomControl:false
        })
        .setView([20.5937,78.9629],5);

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom:19,
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }
    ).addTo(dashboardMap);

    L.control.zoom({
        position:"bottomright"
    }).addTo(dashboardMap);

    const status=document.getElementById("mapStatus");
    if(!navigator.geolocation){
        if(status) status.textContent="Location unavailable — open Mechanics to search manually.";
        return;
    }
    if(status) status.textContent="Detecting your location...";
    // Reuses the location already granted on another page (if it's
    // recent) instead of prompting for permission again every time the
    // dashboard loads.
    window.AutoNexusLocation.getUserLocation().then(({lat,lng})=>{
        currentLocation={lat,lng};
        dashboardMap.setView([lat,lng],13);
        loadMapMechanics(lat,lng);
    }).catch(()=>{
        if(status) status.textContent="Location permission denied — no fake location is shown.";
        document.getElementById("nearbyCount").textContent="0 nearby";
    });
}

function mechanicIcon(){
    return L.divIcon({
        className:"",
        html:`<div class="map-mechanic-marker">
                <i class="fas fa-wrench"></i>
              </div>`,
        iconSize:[29,29],
        iconAnchor:[14,29]
    });
}

function userIcon(){
    return L.divIcon({
        className:"",
        html:`<div class="map-user-marker"></div>`,
        iconSize:[17,17],
        iconAnchor:[8.5,8.5]
    });
}

async function loadMapMechanics(lat,lng){

    document.getElementById("mapStatus")
        .textContent="Finding mechanics...";

    // Same short delay + shared randomized generator as the Mechanics
    // page, so results here feel like a real search and stay consistent
    // in behaviour with the full page (varying count/selection, not a
    // fixed hardcoded list).
    await new Promise(resolve=>{
        setTimeout(resolve,2000+Math.random()*1000);
    });

    const places = window.AutoNexusMechanics.generateNearbyMechanics(lat,lng);

    drawMechanics(places);

    document.getElementById("mapStatus").textContent =
        `${places.length} mechanics`;

    document.getElementById("nearbyCount").textContent =
        `${places.length} nearby`;

    document.getElementById("mapSubtitle").textContent =
        "Nearby automotive service locations.";

    setUserMarker(lat,lng);
}

function drawMechanics(places){

    mechanicMarkers.forEach(
        marker=>dashboardMap.removeLayer(marker)
    );

    mechanicMarkers=[];

    places.forEach(place=>{

        const marker =
            L.marker(
                [place.lat,place.lng],
                {icon:mechanicIcon()}
            )
            .addTo(dashboardMap)
            .bindPopup(`
                <strong>${escapeHTML(place.name)}</strong>
                <br>
                <span style="font-size:11px;color:#777;">
                    Nearby mechanic
                </span>
                <br><br>
                <button onclick="go('mechanics-map-page/mechanics-map.html')"
                        style="padding:6px 9px;border:0;border-radius:6px;background:#C8A96A;cursor:pointer;">
                    View Full Map
                </button>
            `);

        mechanicMarkers.push(marker);
    });
}

function setUserMarker(lat,lng){

    currentLocation={lat,lng};

    if(userMarker){
        userMarker.setLatLng([lat,lng]);
    }else{
        userMarker =
            L.marker(
                [lat,lng],
                {
                    icon:userIcon(),
                    zIndexOffset:1000
                }
            )
            .addTo(dashboardMap)
            .bindPopup("Your Location");
    }
}

document.getElementById("locateBtn")
    .addEventListener("click",()=>{

        if(!navigator.geolocation){
            showDashboardToast("Geolocation is not supported.",true);
            return;
        }

        document.getElementById("mapStatus")
            .textContent="Locating you...";

        // Explicit user tap - force a fresh read instead of the cache.
        window.AutoNexusLocation.getUserLocation({force:true}).then(({lat,lng})=>{
            currentLocation={lat,lng};

            dashboardMap.flyTo(
                [lat,lng],
                14,
                {duration:.7}
            );

            loadMapMechanics(lat,lng);
        }).catch(()=>{
            document.getElementById("mapStatus")
                .textContent="Location permission denied";
        });
    });

/* NOTIFICATION DRAWER */

function closeNotifications(){

    document.getElementById("notificationDrawer")
        .classList.remove("show");

    document.getElementById("drawerBackdrop")
        .classList.remove("show");
}

document.getElementById("drawerBackdrop")
    .addEventListener("click",closeNotifications);

/* THEME */
// Shared across every page via the "autonexus_theme" key and the inline
// head script each page loads (see <head> of every .html file), so the
// toggle here is reflected everywhere else, including after a refresh.

function applyThemeIcon(){
    const isLight = document.documentElement.classList.contains("light");
    document.getElementById("themeBtn")
        .querySelector("i")
        .className = isLight ? "fas fa-sun" : "fas fa-moon";
}

// The <head> script already applied the saved theme before paint —
// just sync the button icon to match on load.
applyThemeIcon();

document.getElementById("themeBtn")
    .addEventListener("click",()=>{

        const isLight =
            document.documentElement.classList.toggle("light");

        localStorage.setItem(
            "autonexus_theme",
            isLight ? "light" : "dark"
        );

        applyThemeIcon();
    });

// Keep the theme in sync if it's changed from another open tab.
window.addEventListener("storage",event=>{
    if(event.key==="autonexus_theme"){
        document.documentElement.classList.toggle(
            "light",
            event.newValue==="light"
        );
        applyThemeIcon();
    }
});

/* HELPERS */

function escapeHTML(value){

    return String(value)
        .replace(/[&<>"']/g,char=>({
            "&":"&amp;",
            "<":"&lt;",
            ">":"&gt;",
            '"':"&quot;",
            "'":"&#039;"
        }[char]));
}

/* LIVE UPDATE */

function getSnapshot(){

    return [
        localStorage.getItem(DB_KEY),
        localStorage.getItem(AI_CHAT_KEY)
    ].join("|");
}

function liveSync(){

    const snapshot=getSnapshot();

    if(snapshot!==lastSnapshot){

        lastSnapshot=snapshot;

        /*
            Reload external records and update every dashboard
            module. This is intentionally frequent for a local
            prototype so another page can update the dashboard
            without a manual refresh.
        */
        refreshDashboard();
    }

    updateClock();
}

window.addEventListener("storage",event=>{

    if([DB_KEY,AI_CHAT_KEY].includes(event.key)){
        lastSnapshot="";
        liveSync();
    }
});

/* START */

setupUser();
normalizeDB();
refreshDashboard();

try{
    initializeMap();
}catch(err){
    console.error("Map failed to initialize:",err);
    const status=document.getElementById("mapStatus");
    if(status) status.textContent="Map unavailable — open Mechanics to search manually.";
}

lastSnapshot=getSnapshot();

setInterval(liveSync,1000);

window.addEventListener("focus",()=>{
    lastSnapshot="";
    liveSync();
});
