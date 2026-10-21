/*
    AutoNexus Mechanics Map

    APIs used:
    1. Leaflet.js -> interactive map
    2. OpenStreetMap -> map tiles
    3. Nominatim -> location search/geocoding
    4. Overpass API -> nearby mechanic / auto-service POIs

    For production:
    - Use a proper map/search provider or your own backend.
    - Do not expose private API keys in frontend JavaScript.
    - Cache/proxy third-party requests through your backend.
*/

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
// Mechanic listings are generated instantly around whatever location
// is given (GPS or searched city) instead of depending on a live
// third-party POI lookup (e.g. Overpass), which was slow and would
// intermittently fail/time out with no backend proxy in front of it.

let map;
let userMarker = null;
let mechanicMarkers = [];
let mechanicData = [];
let selectedMechanicId = null;
let userLocation = null;

const mechanicList = document.getElementById("mechanicList");
const mapStatus = document.getElementById("mapStatus");
const resultsText = document.getElementById("resultsText");

/* MAP INITIALIZATION */

function initializeMap(){
    map=L.map("map",{zoomControl:false}).setView([20.5937,78.9629],5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'}).addTo(map);
    L.control.zoom({position:"bottomright"}).addTo(map);
    mapStatus.textContent="Detecting your current location...";
    if(!navigator.geolocation){
        mapStatus.textContent="Location is not supported. Search manually.";
        resultsText.textContent="Search for a city or location to find nearby mechanics.";
        return;
    }
    // Reuses the location already granted on another page (Dashboard,
    // etc.) if it's recent, instead of asking for permission again.
    window.AutoNexusLocation.getUserLocation().then(async ({lat,lng})=>{
        userLocation={lat,lng,name:"Your Location"};
        map.setView([userLocation.lat,userLocation.lng],14);
        setUserMarker(userLocation.lat,userLocation.lng,"Your current location");
        await loadMechanics(userLocation.lat,userLocation.lng);
    }).catch(()=>{
        mapStatus.textContent="Location permission denied. Search manually.";
        resultsText.textContent="Allow location access or enter a city/location above.";
        clearMechanicMarkers(); mechanicData=[]; renderMechanics();
    });
}

/* CUSTOM ICONS */

function mechanicIcon(){
    return L.divIcon({
        className:"",
        html:`<div class="mechanic-marker">
                <i class="fas fa-screwdriver-wrench"></i>
              </div>`,
        iconSize:[38,38],
        iconAnchor:[19,38],
        popupAnchor:[0,-35]
    });
}

function favoriteIcon(){
    return L.divIcon({
        className:"",
        html:`<div class="mechanic-marker favorite-marker">
                <i class="fas fa-heart"></i>
              </div>`,
        iconSize:[38,38],
        iconAnchor:[19,38],
        popupAnchor:[0,-35]
    });
}

function userIcon(){
    return L.divIcon({
        className:"",
        html:`<div class="user-marker"></div>`,
        iconSize:[22,22],
        iconAnchor:[11,11]
    });
}

/* LOCATION SEARCH */

async function geocodeLocation(query){
    mapStatus.textContent = "Searching location...";

    const url =
        `${NOMINATIM_URL}?format=jsonv2&limit=1&q=` +
        encodeURIComponent(query);

    const response = await fetch(url,{
        headers:{
            "Accept":"application/json"
        }
    });

    if(!response.ok){
        throw new Error("Location search failed");
    }

    const results = await response.json();

    if(!results.length){
        throw new Error("Location not found");
    }

    return {
        lat:parseFloat(results[0].lat),
        lng:parseFloat(results[0].lon),
        name:results[0].display_name
    };
}

document.getElementById("searchLocationBtn")
    .addEventListener("click",searchLocation);

document.getElementById("locationInput")
    .addEventListener("keydown",e=>{
        if(e.key==="Enter"){
            searchLocation();
        }
    });

async function searchLocation(){
    const query =
        document.getElementById("locationInput")
            .value.trim();

    if(!query){
        mapStatus.textContent="Enter a city or location to search.";
        resultsText.textContent="No location was entered.";
        return;
    }

    try{
        const location = await geocodeLocation(query);

        userLocation = location;

        map.setView(
            [location.lat,location.lng],
            14
        );

        setUserMarker(
            location.lat,
            location.lng,
            location.name
        );

        await loadMechanics(
            location.lat,
            location.lng
        );

    }catch(error){
        console.error(error);
        mapStatus.textContent = "Location search failed.";
        resultsText.textContent = "Unable to find that location. Try another city or location.";
    }
}

/* BROWSER LOCATION */

document.getElementById("useLocationBtn")
    .addEventListener("click",useBrowserLocation);

function useBrowserLocation(){
    if(!navigator.geolocation){
        mapStatus.textContent="Geolocation is not supported by this browser.";
        resultsText.textContent="Use the manual location search instead.";
        return;
    }

    mapStatus.textContent = "Detecting your location...";

    // Explicit button tap - force a fresh read instead of the cache.
    window.AutoNexusLocation.getUserLocation({force:true}).then(async ({lat,lng})=>{
        userLocation = { lat, lng, name:"Your Location" };

        map.setView(
            [userLocation.lat,userLocation.lng],
            14
        );

        setUserMarker(
            userLocation.lat,
            userLocation.lng,
            "Your current location"
        );

        await loadMechanics(
            userLocation.lat,
            userLocation.lng
        );
    }).catch(()=>{
        mapStatus.textContent = "Location permission denied.";
        resultsText.textContent = "Allow location access or search for a location manually.";
    });
}

function setUserMarker(lat,lng,popupText){
    if(userMarker){
        userMarker.setLatLng([lat,lng]);
    }else{
        userMarker = L.marker(
            [lat,lng],
            {icon:userIcon(),zIndexOffset:1000}
        ).addTo(map);
    }

    userMarker.bindPopup(
        `<strong>Your Location</strong><br>
         <span style="color:#777;font-size:11px;">
         ${escapeHTML(popupText)}
         </span>`
    );
}

/* OVERPASS API */

async function loadMechanics(lat,lng){
    mapStatus.textContent = "Finding nearby mechanics...";
    resultsText.textContent = "Searching nearby services...";

    clearMechanicMarkers();

    // Small delay so results feel like an actual search rather than
    // popping in instantly, and generate a fresh randomized set of
    // nearby mechanics (varies in count and selection every time).
    await new Promise(resolve=>{
        setTimeout(resolve,2000+Math.random()*1000);
    });

    mechanicData = applyFavoriteState(
        window.AutoNexusMechanics.generateNearbyMechanics(lat,lng)
    );

    mapStatus.textContent = `${mechanicData.length} nearby mechanic/service locations`;
    resultsText.textContent = `${mechanicData.length} results near this location`;

    renderMechanics();
    updateMapMarkers();
}

/* MAP MARKERS */

function clearMechanicMarkers(){
    mechanicMarkers.forEach(marker=>{
        map.removeLayer(marker);
    });

    mechanicMarkers = [];
}

function updateMapMarkers(){
    clearMechanicMarkers();

    mechanicData.forEach(mechanic=>{
        const marker = L.marker(
            [mechanic.lat,mechanic.lng],
            {
                icon:mechanic.favorite
                    ? favoriteIcon()
                    : mechanicIcon()
            }
        ).addTo(map);

        marker.bindPopup(
            createPopup(mechanic)
        );

        marker.on("click",()=>{
            selectMechanic(mechanic.id,false);
        });

        mechanicMarkers.push(marker);
    });
}

function createPopup(mechanic){
    const rating =
        mechanic.rating !== null
            ? `★ ${mechanic.rating}`
            : "Rating unavailable";

    return `
        <div class="popup-title">
            ${escapeHTML(mechanic.name)}
        </div>

        <div class="popup-location">
            ${escapeHTML(mechanic.address)}
        </div>

        <div class="popup-rating">
            ${rating}
            • ${mechanic.distance.toFixed(1)} km
        </div>

        <div class="popup-service">
            ${mechanic.services
                .map(service=>escapeHTML(service))
                .join(" • ")}
        </div>

        <button class="popup-button"
                onclick="selectMechanic('${mechanic.id}',true)">
            View Details
        </button>
    `;
}

/* LIST */

function renderMechanics(){
    const service =
        document.getElementById("serviceFilter").value;

    const sort =
        document.getElementById("sortFilter").value;

    let filtered = mechanicData.filter(mechanic=>{
        if(service==="all"){
            return true;
        }

        return mechanic.services.some(
            item=>normalizeService(item)===service
        );
    });

    filtered = [...filtered].sort((a,b)=>{
        if(sort==="rating"){
            return (b.rating || 0)-(a.rating || 0);
        }

        return a.distance-b.distance;
    });

    resultsText.textContent =
        `${filtered.length} mechanic${filtered.length===1?"":"s"} found`;

    if(!filtered.length){
        mechanicList.innerHTML = `
            <div class="empty-list">
                <i class="fas fa-magnifying-glass"></i>
                No mechanics found for this service.
            </div>
        `;
        return;
    }

    mechanicList.innerHTML = filtered.map(mechanic=>`
        <div class="mechanic-card
            ${selectedMechanicId===mechanic.id ? "selected" : ""}"
            onclick="selectMechanic('${mechanic.id}',true)">

            <div class="mechanic-top">

                <div class="mechanic-list-avatar">
                    <i class="fas fa-screwdriver-wrench"></i>
                </div>

                <div class="mechanic-main">
                    <strong>${escapeHTML(mechanic.name)}</strong>
                    <span>${escapeHTML(mechanic.address)}</span>
                </div>

                <button class="favorite-btn
                    ${mechanic.favorite ? "active" : ""}"
                    onclick="toggleFavorite(event,'${mechanic.id}')"
                    title="Favourite">
                    <i class="fas fa-heart"></i>
                </button>

            </div>

            <div class="mechanic-meta">

                <span class="rating">
                    ${
                        mechanic.rating !== null
                        ? `★ ${mechanic.rating}`
                        : "★ —"
                    }
                </span>

                <span class="distance">
                    ${mechanic.distance.toFixed(1)} km away
                </span>

                <span class="open-status">
                    ${mechanic.open===false
                        ? "Closed"
                        : "Open"}
                </span>

            </div>

            <div class="service-tags">
                ${mechanic.services
                    .slice(0,4)
                    .map(service=>`
                        <span class="service-tag">
                            ${escapeHTML(service)}
                        </span>
                    `).join("")}
            </div>

        </div>
    `).join("");
}

function normalizeService(service){
    const value = service.toLowerCase();

    if(value.includes("tyre") || value.includes("tire")){
        return "tyres";
    }

    if(value.includes("battery")){
        return "battery";
    }

    if(value.includes("oil") || value.includes("service")){
        return "oil";
    }

    if(value.includes("wash")){
        return "car_wash";
    }

    return "car_repair";
}

document.getElementById("serviceFilter")
    .addEventListener("change",renderMechanics);

document.getElementById("sortFilter")
    .addEventListener("change",renderMechanics);

/* SELECT MECHANIC */

function selectMechanic(id,flyTo=true){
    const mechanic =
        mechanicData.find(item=>item.id===id);

    if(!mechanic){
        return;
    }

    selectedMechanicId = id;
    renderMechanics();

    if(flyTo){
        map.flyTo(
            [mechanic.lat,mechanic.lng],
            16,
            {duration:.8}
        );
    }

    const markerIndex =
        mechanicData.findIndex(item=>item.id===id);

    const marker = mechanicMarkers[markerIndex];

    if(marker){
        marker.openPopup();
    }

    renderSelectedMechanic(mechanic);

    document.getElementById("selectedMechanic")
        .scrollIntoView({
            behavior:"smooth",
            block:"nearest"
        });
}

function renderSelectedMechanic(mechanic){
    const rating =
        mechanic.rating !== null
            ? `★ ${mechanic.rating}`
            : "Rating unavailable";

    const websiteButton = mechanic.website
        ? `
            <button class="action-btn secondary"
                    onclick="window.open('${escapeAttribute(mechanic.website)}','_blank')">
                <i class="fas fa-globe"></i> Website
            </button>
          `
        : "";

    // Note: no direct "Call Mechanic" option here — booking goes through
    // the in-app Book Now flow instead.

    document.getElementById("selectedMechanic").innerHTML = `
        <div class="selected-content">

            <div>
                <div class="selected-info">

                    <div class="selected-avatar">
                        <i class="fas fa-screwdriver-wrench"></i>
                    </div>

                    <div>
                        <span class="section-label">SELECTED MECHANIC</span>
                        <h2>${escapeHTML(mechanic.name)}</h2>
                        <p>
                            ${escapeHTML(mechanic.address)}
                        </p>
                    </div>

                </div>

                <div class="selected-stats">

                    <div class="selected-stat">
                        <i class="fas fa-star"></i>
                        ${rating}
                    </div>

                    <div class="selected-stat">
                        <i class="fas fa-location-dot"></i>
                        ${mechanic.distance.toFixed(1)} km away
                    </div>

                    <div class="selected-stat">
                        <i class="fas fa-clock"></i>
                        ${mechanic.open===false
                            ? "Closed"
                            : "Open now"}
                    </div>

                    <div class="selected-stat">
                        <i class="fas fa-wrench"></i>
                        ${mechanic.services.length} services
                    </div>

                </div>
            </div>

            <div class="selected-actions">
                ${websiteButton}

                <button class="action-btn primary"
                        onclick="openBooking('${mechanic.id}')">
                    <i class="fas fa-calendar-check"></i>
                    Book Now
                </button>
            </div>

        </div>
    `;
}

/* FAVORITES */

/* FAVOURITES - synced with Profile page via AutoNexusSync */

function getFavoriteMechanics(){
    if(!window.AutoNexusSync) return [];
    const db = window.AutoNexusSync.getDB();
    return Array.isArray(db.mechanics) ? db.mechanics : [];
}

function saveFavoriteMechanics(list){
    if(!window.AutoNexusSync) return;
    const db = window.AutoNexusSync.getDB();
    db.mechanics = list;
    window.AutoNexusSync.saveDB(db);
}

// Marks mechanics already saved as favourites (from any page) as
// favourite:true so the heart icon stays correct across reloads/pages.
function applyFavoriteState(list){
    const favIds = new Set(
        getFavoriteMechanics().map(f=>String(f.id))
    );
    list.forEach(m=>{
        m.favorite = favIds.has(String(m.id));
    });
    return list;
}

function toggleFavorite(event,id){
    event.stopPropagation();

    const mechanic =
        mechanicData.find(item=>item.id===id);

    if(!mechanic){
        return;
    }

    mechanic.favorite = !mechanic.favorite;

    const favorites = getFavoriteMechanics()
        .filter(f=>String(f.id)!==String(id));

    if(mechanic.favorite){
        favorites.push({
            id:mechanic.id,
            name:mechanic.name,
            lat:mechanic.lat,
            lng:mechanic.lng,
            address:mechanic.address,
            phone:mechanic.phone,
            rating:mechanic.rating,
            services:mechanic.services
        });
    }

    saveFavoriteMechanics(favorites);

    updateMapMarkers();
    renderMechanics();
}

/* BOOKING */

let bookingMechanicId = null;

function getUserVehicles(){
    try{
        const raw = localStorage.getItem("autonexus_vehicles");
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    }catch{ return []; }
}

function populateBookingVehicles(){
    const select = document.getElementById("bookingVehicle");
    const vehicles = getUserVehicles();

    if(!vehicles.length){
        select.innerHTML = `<option value="">No vehicles added yet</option>`;
        select.disabled = true;
        return;
    }

    select.disabled = false;
    const active = window.AutoNexusSync.getActiveVehicle(vehicles);

    select.innerHTML = vehicles.map(v=>{
        const label = `${v.name}${v.number ? " - "+v.number : ""}`;
        const selected = active && String(v.id)===String(active.id) ? "selected" : "";
        return `<option value="${escapeAttribute(v.id)}" ${selected}>${escapeHTML(label)}</option>`;
    }).join("");
}

function openBooking(id){
    const mechanic =
        mechanicData.find(item=>item.id===id);

    if(!mechanic){
        return;
    }

    bookingMechanicId = id;

    document.getElementById("bookingTitle").textContent =
        `Book ${mechanic.name}`;

    document.getElementById("bookingSubtitle").textContent =
        `${mechanic.address} • ${mechanic.distance.toFixed(1)} km away`;

    populateBookingVehicles();

    document.getElementById("bookingModal")
        .classList.add("show");

    const today = new Date();

    document.getElementById("bookingDate").min =
        today.toISOString().split("T")[0];
}

document.getElementById("closeBooking")
    .addEventListener("click",closeBooking);

document.getElementById("bookingModal")
    .addEventListener("click",event=>{
        if(event.target.id==="bookingModal"){
            closeBooking();
        }
    });

function closeBooking(){
    document.getElementById("bookingModal")
        .classList.remove("show");
}

document.getElementById("bookingForm")
    .addEventListener("submit",event=>{
        event.preventDefault();

        const mechanic =
            mechanicData.find(item=>item.id===bookingMechanicId);

        if(!mechanic){
            return;
        }

        const vehicleId = document.getElementById("bookingVehicle").value;
        if(!vehicleId){
            showMechanicsToast("Add a vehicle on the My Vehicles page before booking a mechanic.",true);
            return;
        }

        const vehicles = getUserVehicles();
        const selectedVehicle = vehicles.find(v=>String(v.id)===String(vehicleId));

        const booking = {
            id:Date.now(),
            mechanic:mechanic.name,
            area:mechanic.address,
            service:document.getElementById("bookingService").value,
            vehicle:selectedVehicle ? `${selectedVehicle.name}${selectedVehicle.number ? " - "+selectedVehicle.number : ""}` : "",
            date:document.getElementById("bookingDate").value,
            time:document.getElementById("bookingTime").value,
            amount:0,
            status:"Confirmed",
            rating:null,
            notes:document.getElementById("bookingNotes").value
        };

        // BUGFIX: same class of issue as the My Vehicles page - saveDB()
        // used to be called with no way to know whether the write actually
        // stuck. Use saveDBSafe() so a storage failure surfaces to the
        // person immediately instead of the booking silently vanishing on
        // the next reload.
        const db=window.AutoNexusSync.getDB();
        db.bookings=Array.isArray(db.bookings)?db.bookings:[];
        db.bookings.unshift(booking);
        const ok=window.AutoNexusSync.saveDBSafe(db);

        closeBooking();
        event.target.reset();

        if(ok) showMechanicsToast(`Booking confirmed with ${mechanic.name}.`);
        else showMechanicsToast("This device isn't saving changes right now, so this booking will disappear on refresh. Check your browser's storage/privacy settings for this site.",true);
    });

function showMechanicsToast(message,error=false){
    let t=document.getElementById("mechanicsToast");
    if(!t){t=document.createElement("div");t.id="mechanicsToast";t.style.cssText="position:fixed;right:24px;bottom:24px;z-index:100000;padding:13px 18px;border-radius:10px;background:var(--card,#111827);color:var(--text,#fff);border:1px solid var(--border,rgba(255,255,255,.12));box-shadow:0 12px 35px rgba(0,0,0,.25)";document.body.appendChild(t)}
    t.textContent=message;t.style.borderColor=error?"#ef4444":"var(--border,rgba(255,255,255,.12))";clearTimeout(showMechanicsToast.timer);showMechanicsToast.timer=setTimeout(()=>t.remove(),2500);
}

/* MAP CONTROLS */

document.getElementById("recenterBtn")
    .addEventListener("click",()=>{
        if(userLocation){
            map.flyTo(
                [userLocation.lat,userLocation.lng],
                14
            );
        }else{
            // No location yet - recenter on the India-wide default view
            // used at startup instead of a fixed city.
            map.flyTo([20.5937,78.9629],5);
        }
    });

document.getElementById("zoomInBtn")
    .addEventListener("click",()=>{
        map.zoomIn();
    });

document.getElementById("zoomOutBtn")
    .addEventListener("click",()=>{
        map.zoomOut();
    });

/* HELPERS */

function distanceKm(lat1,lng1,lat2,lng2){
    const R = 6371;

    const dLat = toRadians(lat2-lat1);
    const dLng = toRadians(lng2-lng1);

    const a =
        Math.sin(dLat/2)**2 +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLng/2)**2;

    return R * 2 * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1-a)
    );
}

function toRadians(value){
    return value * Math.PI / 180;
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

function escapeAttribute(value){
    return String(value)
        .replace(/&/g,"&amp;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");
}

function logout(){
    localStorage.removeItem("loggedInUser");
    sessionStorage.removeItem("loggedInUser");
    window.location.href="../login.html";
}

/* NOTIFICATIONS */
// The top-bar bell badge is handled globally by autonexus-sync.js's
// shared notification system (upcoming reminders + expiring documents),
// which stays accurate across every page. This page used to keep its
// own separate count based on upcoming bookings and overwrite the
// badge with that instead, which is why it sometimes showed a number
// that didn't match your actual notifications.

/* START */

try{
    initializeMap();
}catch(err){
    console.error("Map failed to initialize:",err);
    if(mapStatus) mapStatus.textContent="Map unavailable. Search for a city or location above.";
    if(resultsText) resultsText.textContent="Search for a city or location to find nearby mechanics.";
}
