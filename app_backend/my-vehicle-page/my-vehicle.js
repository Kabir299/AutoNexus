const STORAGE_KEY="autonexus_vehicles";
const REMINDERS_KEY="autonexus_reminders";
let vehicles=[];

function readVehicles(){
    try{
        const db=window.AutoNexusSync.getDB();
        if(Array.isArray(db.vehicles)) return db.vehicles;
        const raw=localStorage.getItem(STORAGE_KEY);
        return raw?JSON.parse(raw):[];
    }catch{return []}
}
function showVehicleToast(message,error=false){
    let t=document.getElementById("vehicleToast");
    if(!t){t=document.createElement("div");t.id="vehicleToast";t.style.cssText="position:fixed;right:24px;bottom:24px;z-index:100000;padding:13px 18px;border-radius:10px;background:var(--card,#111827);color:var(--text,#fff);border:1px solid var(--border,rgba(255,255,255,.12));box-shadow:0 12px 35px rgba(0,0,0,.25)";document.body.appendChild(t);}
    t.textContent=message;t.style.borderColor=error?"#ef4444":"var(--border,rgba(255,255,255,.12))";clearTimeout(showVehicleToast.timer);showVehicleToast.timer=setTimeout(()=>t.remove(),3500);
}
function saveVehicles(next){
    vehicles=Array.isArray(next)?next:[];
    // BUGFIX: this used to call AutoNexusSync.saveDB() directly with no
    // error handling. If the write didn't actually persist (blocked/limited
    // storage, private browsing, etc.) the vehicle still stayed in the
    // in-memory `vehicles` array and rendered normally for the rest of the
    // session, then disappeared the moment the page reloaded - with
    // nothing telling the person that happened. saveDBSafe() round-trips
    // the write and reports back so we can warn immediately instead.
    const db=window.AutoNexusSync.getDB();
    db.vehicles=vehicles;
    const ok=window.AutoNexusSync.saveDBSafe(db);
    if(!ok) showVehicleToast("This device isn't saving changes right now, so this vehicle will disappear on refresh. Check your browser's storage/privacy settings for this site.",true);
}
function getReminders(){try{const v=JSON.parse(localStorage.getItem(REMINDERS_KEY));return Array.isArray(v)?v:[]}catch{return []}}
function daysUntil(date){if(!date)return Infinity;const t=new Date();t.setHours(0,0,0,0);const d=new Date(date+"T00:00:00");return Math.ceil((d-t)/86400000)}
function formatDate(date){return window.AutoNexusSync.formatDate(date)}
function escapeHTML(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

const container=document.getElementById("vehicleContainer");
const search=document.getElementById("vehicleSearch");
const filter=document.getElementById("fuelFilter");
const modal=document.getElementById("vehicleModal");
const form=document.getElementById("vehicleForm");

function renderVehicles(){
    const query=search.value.trim().toLowerCase(), fuel=filter.value;
    const filtered=vehicles.filter(v=>(String(v.name||"").toLowerCase().includes(query)||String(v.number||"").toLowerCase().includes(query))&&(fuel==="all"||v.fuel===fuel));
    if(!filtered.length){container.innerHTML=`<div class="empty-state"><i class="fas fa-car-side" style="font-size:2rem;margin-bottom:12px"></i><h3>No vehicles found</h3><p>Add a vehicle to your AutoNexus garage.</p></div>`;}
    else container.innerHTML=filtered.map(v=>{
        const days=daysUntil(v.insurance), active=!!v.active;
        const health=window.AutoNexusSync.computeVehicleHealth(v);
        const healthLabel=health.overall>=75?"Healthy":health.overall>=50?"Needs Attention":"Service Soon";
        return `<article class="vehicle-card">
            <div class="vehicle-top"><div class="vehicle-icon"><i class="fas fa-car-side"></i></div><span class="status ${active?"active":"inactive"}">${active?"Active":"Not Active"}</span></div>
            <h3>${escapeHTML(v.name||"Vehicle")}</h3><div class="registration">${escapeHTML(v.number||"—")}</div>
            <div class="vehicle-meta">
                <div class="meta-box"><span>Fuel Type</span><strong>${escapeHTML(v.fuel||"—")}</strong></div>
                <div class="meta-box"><span>Mileage</span><strong>${Number(v.mileage||0).toLocaleString("en-IN")} km</strong></div>
                <div class="meta-box"><span>Insurance</span><strong>${formatDate(v.insurance)}</strong></div>
                <div class="meta-box"><span>Health</span><strong>${health.overall}% • ${healthLabel}</strong></div>
            </div>
            <div class="vehicle-actions">
                <button onclick="viewVehicle(${JSON.stringify(v.id)})"><i class="fas fa-eye"></i> View</button>
                <button onclick="editVehicle(${JSON.stringify(v.id)})"><i class="fas fa-pen"></i> Edit</button>
                <button class="set-active ${active?"is-active":""}" onclick="setActiveVehicleAction(${JSON.stringify(v.id)})" ${active?"disabled":""}><i class="fas fa-star"></i> ${active?"Active":"Set Active"}</button>
                <button class="delete" onclick="deleteVehicle(${JSON.stringify(v.id)})"><i class="fas fa-trash"></i></button>
            </div>
        </article>`;
    }).join("");
    updateOverview();renderReminders();renderHealthPanel();
}
function updateOverview(){
    document.getElementById("vehicleCount").textContent=vehicles.length;
    document.getElementById("fuelCount").textContent=vehicles.filter(v=>v.fuel!=="Electric").length;
    document.getElementById("renewalCount").textContent=vehicles.filter(v=>daysUntil(v.insurance)<=30).length;
    const active=window.AutoNexusSync.getActiveVehicle(vehicles),stat=document.getElementById("garageHealthStat");
    if(stat)stat.textContent=active?`${window.AutoNexusSync.computeVehicleHealth(active).overall}%`:"--%";
}
function renderReminders(){
    const holder=document.getElementById("vehicleReminders");if(!holder)return;
    const reminders=window.AutoNexusSync.getUpcomingReminders(getReminders(),5);
    holder.innerHTML=reminders.length?reminders.map(r=>{const d=window.AutoNexusSync.daysRemaining(r.date);const cls=d<0?"danger":d<=7?"warning":"normal";return `<div class="reminder"><div class="reminder-icon reminder-type"><i class="fas fa-calendar-check"></i></div><div><strong>${escapeHTML(r.title||"Reminder")}</strong><p>${escapeHTML(r.category||"Vehicle")} • ${escapeHTML(r.vehicle||"")} • ${formatDate(r.date)}</p></div><span class="${cls}">${d<0?"Overdue":d===0?"Today":`${d}d left`}</span></div>`}).join(""):`<div class="reminder" style="border-top:none"><div class="reminder-icon reminder-type"><i class="fas fa-circle-check"></i></div><div><strong>No upcoming reminders</strong><p>You're all caught up.</p></div></div>`;
}
function renderHealthPanel(){
    const score=document.getElementById("healthRingScore");if(!score)return;
    const active=window.AutoNexusSync.getActiveVehicle(vehicles),label=document.getElementById("healthRingLabel"),name=document.getElementById("healthActiveVehicleName"),note=document.getElementById("healthCopyNote"),breakdown=document.getElementById("healthBreakdown");
    if(!active){score.textContent="--%";label.textContent="--";name.textContent="No active vehicle";note.textContent="Add a vehicle to see its health breakdown.";breakdown.innerHTML="";return}
    const h=window.AutoNexusSync.computeVehicleHealth(active);score.textContent=`${h.overall}%`;label.textContent=h.overall>=75?"Healthy":h.overall>=50?"Needs Attention":"Service Soon";name.textContent=`${active.name} • ${active.number}`;note.textContent="Health changes gradually using service/replacement dates and mileage.";
    breakdown.innerHTML=`<div class="health-item"><span>Engine</span><strong>${h.engine}%</strong></div><div class="health-item"><span>Battery</span><strong>${h.battery}%</strong></div><div class="health-item"><span>Tyres</span><strong>${h.tyre}%</strong></div><div class="health-item"><span>Brakes</span><strong>${h.brake}%</strong></div>`;
}
function openModal(editId=null){
    modal.classList.add("show");form.dataset.editId=editId??"";document.querySelector("#vehicleModal h2").textContent=editId?"Edit Vehicle":"Add New Vehicle";document.getElementById("vehicleName").focus();
}
function closeModal(){modal.classList.remove("show");form.reset();delete form.dataset.editId;document.querySelector("#vehicleModal h2").textContent="Add New Vehicle"}
document.getElementById("addVehicleBtn").addEventListener("click",()=>openModal());
document.getElementById("closeModal").addEventListener("click",closeModal);
modal.addEventListener("click",e=>{if(e.target===modal)closeModal()});
search.addEventListener("input",renderVehicles);filter.addEventListener("change",renderVehicles);
form.addEventListener("submit",e=>{
    e.preventDefault();
    const rawId=form.dataset.editId, editId=rawId?String(rawId):null, existing=editId?vehicles.find(v=>String(v.id)===editId):null;
    const data={name:document.getElementById("vehicleName").value.trim(),number:document.getElementById("vehicleNumber").value.trim().toUpperCase(),fuel:document.getElementById("fuelType").value,insurance:document.getElementById("insuranceDate").value,mileage:Number(document.getElementById("mileage").value)||0,lastServiceDate:document.getElementById("lastServiceDate").value,lastServiceMileage:document.getElementById("lastServiceMileage").value?Number(document.getElementById("lastServiceMileage").value):"",tyresChangedDate:document.getElementById("tyresChangedDate").value,brakesChangedDate:document.getElementById("brakesChangedDate").value,batteryChangedDate:document.getElementById("batteryChangedDate").value};
    if(existing) vehicles=vehicles.map(v=>String(v.id)===editId?{...v,...data,id:v.id,active:!!v.active}:v);
    else {const v={id:Date.now(),active:false,status:"Active",...data};vehicles.push(v);window.AutoNexusSync.setActiveVehicle(vehicles,v.id)}
    saveVehicles(vehicles);closeModal();renderVehicles();
});
function viewVehicle(id){
    const v=vehicles.find(x=>String(x.id)===String(id));if(!v)return;
    const h=window.AutoNexusSync.computeVehicleHealth(v),healthLabel=h.overall>=75?"Healthy":h.overall>=50?"Needs Attention":"Service Soon";
    let panel=document.getElementById("vehicleDetailsModal");
    if(!panel){panel=document.createElement("div");panel.id="vehicleDetailsModal";panel.className="modal";document.body.appendChild(panel)}
    panel.innerHTML=`<div class="modal-content vehicle-details-modal"><button class="close" type="button" onclick="closeVehicleDetails()">&times;</button><span class="section-label">VEHICLE DETAILS</span><h2>${escapeHTML(v.name)}</h2><p class="modal-subtitle">${escapeHTML(v.number||"Registration unavailable")}</p><div class="vehicle-detail-grid"><div><span>Fuel Type</span><strong>${escapeHTML(v.fuel||"—")}</strong></div><div><span>Current Mileage</span><strong>${Number(v.mileage||0).toLocaleString("en-IN")} km</strong></div><div><span>Insurance Expiry</span><strong>${formatDate(v.insurance)}</strong></div><div><span>Vehicle Status</span><strong>${v.active?"Active Vehicle":"Not Active"}</strong></div><div><span>Last Service</span><strong>${formatDate(v.lastServiceDate)}</strong></div><div><span>Service Mileage</span><strong>${v.lastServiceMileage!==""&&v.lastServiceMileage!=null?Number(v.lastServiceMileage).toLocaleString("en-IN")+" km":"Not specified"}</strong></div><div><span>Tyres Changed</span><strong>${formatDate(v.tyresChangedDate)}</strong></div><div><span>Brakes Changed</span><strong>${formatDate(v.brakesChangedDate)}</strong></div><div><span>Battery Changed</span><strong>${formatDate(v.batteryChangedDate)}</strong></div><div><span>Overall Health</span><strong>${h.overall}% • ${healthLabel}</strong></div></div><h3 class="vehicle-detail-health-title">Health Breakdown</h3><div class="vehicle-detail-health"><div><span>Engine</span><b>${h.engine}%</b><i><em style="width:${h.engine}%"></em></i></div><div><span>Tyres</span><b>${h.tyre}%</b><i><em style="width:${h.tyre}%"></em></i></div><div><span>Brakes</span><b>${h.brake}%</b><i><em style="width:${h.brake}%"></em></i></div><div><span>Battery</span><b>${h.battery}%</b><i><em style="width:${h.battery}%"></em></i></div></div></div>`;
    panel.classList.add("show");
}
function closeVehicleDetails(){const p=document.getElementById("vehicleDetailsModal");if(p)p.classList.remove("show")}
function editVehicle(id){const v=vehicles.find(x=>String(x.id)===String(id));if(!v)return;document.getElementById("vehicleName").value=v.name||"";document.getElementById("vehicleNumber").value=v.number||"";document.getElementById("fuelType").value=v.fuel||"Petrol";document.getElementById("insuranceDate").value=v.insurance||"";document.getElementById("mileage").value=v.mileage??"";document.getElementById("lastServiceDate").value=v.lastServiceDate||"";document.getElementById("lastServiceMileage").value=v.lastServiceMileage??"";document.getElementById("tyresChangedDate").value=v.tyresChangedDate||"";document.getElementById("brakesChangedDate").value=v.brakesChangedDate||"";document.getElementById("batteryChangedDate").value=v.batteryChangedDate||"";openModal(v.id)}
function setActiveVehicleAction(id){window.AutoNexusSync.setActiveVehicle(vehicles,id);saveVehicles(vehicles);renderVehicles()}
function deleteVehicle(id){const v=vehicles.find(x=>String(x.id)===String(id));if(!v)return;if(!confirm(`Remove ${v.name} from your garage?`))return;const wasActive=!!v.active;vehicles=vehicles.filter(x=>String(x.id)!==String(id));if(wasActive&&vehicles.length)window.AutoNexusSync.setActiveVehicle(vehicles,vehicles[0].id);saveVehicles(vehicles);renderVehicles()}
function logout(){localStorage.removeItem("loggedInUser");sessionStorage.removeItem("loggedInUser");window.location.href="../login.html"}
vehicles=readVehicles();renderVehicles();
window.addEventListener("autonexus:data-updated",()=>{vehicles=readVehicles();renderVehicles()});
