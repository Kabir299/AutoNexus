const user=getLoggedInUser();
if(!user){window.location.href="../login.html"}
function getLoggedInUser(){try{return JSON.parse(localStorage.getItem("loggedInUser"))||JSON.parse(sessionStorage.getItem("loggedInUser"))||null}catch{return null}}
function escapeHTML(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function initials(name){return String(name||"User").split(" ").filter(Boolean).slice(0,2).map(x=>x[0].toUpperCase()).join("")}
function formatDate(d){return d?new Date(d+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}):"—"}
function formatDOB(d){return d?new Date(d+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric"}):"—"}
function currentUser(){return getLoggedInUser()}
function renderProfile(){const u=currentUser();if(!u)return;document.getElementById("avatarLarge").textContent=initials(u.name);document.getElementById("heroName").textContent=u.name||"User";document.getElementById("heroEmail").textContent=u.email||"—";document.getElementById("detailName").textContent=u.name||"—";document.getElementById("detailEmail").textContent=u.email||"—";document.getElementById("detailPhone").textContent=u.phone||"—";document.getElementById("detailCity").textContent=u.location||u.city||"—";document.getElementById("detailDob").textContent=formatDOB(u.dob);document.getElementById("detailGender").textContent=u.gender||"—";}
function openProfileModal(){const u=currentUser();document.getElementById("nameInput").value=u.name||"";document.getElementById("emailInput").value=u.email||"";document.getElementById("phoneInput").value=u.phone||"";document.getElementById("cityInput").value=u.location||u.city||"";document.getElementById("dobInput").value=u.dob||"";document.getElementById("genderInput").value=u.gender||"";document.getElementById("profileModal").classList.add("show")}
document.getElementById("editProfileBtn").addEventListener("click",openProfileModal);document.getElementById("closeProfile").addEventListener("click",()=>document.getElementById("profileModal").classList.remove("show"));document.getElementById("profileModal").addEventListener("click",e=>{if(e.target.id==="profileModal")e.target.classList.remove("show")});
document.getElementById("profileForm").addEventListener("submit",e=>{e.preventDefault();const logged=currentUser();if(!logged)return;const users=JSON.parse(localStorage.getItem("autonexus_users")||"[]");const index=users.findIndex(u=>String(u.id)===String(logged.id)||u.email.toLowerCase()===String(logged.email).toLowerCase());if(index<0)return;const updated={...users[index],name:document.getElementById("nameInput").value.trim(),email:document.getElementById("emailInput").value.trim().toLowerCase(),phone:document.getElementById("phoneInput").value.trim(),location:document.getElementById("cityInput").value.trim(),city:document.getElementById("cityInput").value.trim(),dob:document.getElementById("dobInput").value,gender:document.getElementById("genderInput").value};users[index]=updated;localStorage.setItem("autonexus_users",JSON.stringify(users));if(localStorage.getItem("loggedInUser"))localStorage.setItem("loggedInUser",JSON.stringify(updated));else sessionStorage.setItem("loggedInUser",JSON.stringify(updated));renderProfile();document.getElementById("profileModal").classList.remove("show")});
function getDB(){return window.AutoNexusSync.getDB()}
function renderBookings(){const db=getDB(),bookings=Array.isArray(db.bookings)?db.bookings:[],tbody=document.getElementById("bookingTableBody"),query=document.getElementById("bookingSearch").value.trim().toLowerCase(),filter=document.getElementById("bookingFilter").value;const filtered=bookings.filter(b=>[b.mechanic,b.area,b.service,b.vehicle,b.date].join(" ").toLowerCase().includes(query)&&(filter==="all"||String(b.status||"").toLowerCase()===filter));tbody.innerHTML=filtered.length?filtered.map(b=>`<tr><td><div class="mechanic-cell"><div class="mechanic-avatar"><i class="fas fa-screwdriver-wrench"></i></div><div><strong>${escapeHTML(b.mechanic||"Mechanic")}</strong><span>${escapeHTML(b.area||"")}</span></div></div></td><td>${escapeHTML(b.service||"—")}</td><td>${escapeHTML(b.vehicle||"—")}</td><td>${formatDate(b.date)}<br><small>${escapeHTML(b.time||"—")}</small></td><td>${b.amount?"₹"+Number(b.amount).toLocaleString("en-IN"):"—"}</td><td><span class="status ${String(b.status||"").toLowerCase()}">${escapeHTML(b.status||"Pending")}</span></td><td><button class="view-booking" onclick="viewBooking(${JSON.stringify(b.id)})"><i class="fas fa-eye"></i></button></td></tr>`).join(""):`<tr><td colspan="7" class="empty-table">No bookings found.</td></tr>`;document.getElementById("bookingCount").textContent=bookings.length;document.getElementById("serviceCount").textContent=bookings.filter(b=>String(b.status).toLowerCase()==="completed").length;const ratings=bookings.filter(b=>typeof b.rating==="number").map(b=>b.rating);document.getElementById("ratingCount").textContent=ratings.length?(ratings.reduce((a,b)=>a+b,0)/ratings.length).toFixed(1):"—"}
function viewBooking(id){const b=(getDB().bookings||[]).find(x=>String(x.id)===String(id));if(!b)return;const modal=document.getElementById("bookingModal");document.getElementById("bookingDetails").innerHTML=`<h2>${escapeHTML(b.mechanic||"Mechanic")}</h2><p>${escapeHTML(b.area||"")}</p><div class="booking-detail-grid"><div class="booking-detail-box"><span>Service</span><strong>${escapeHTML(b.service||"—")}</strong></div><div class="booking-detail-box"><span>Vehicle</span><strong>${escapeHTML(b.vehicle||"—")}</strong></div><div class="booking-detail-box"><span>Date</span><strong>${formatDate(b.date)}</strong></div><div class="booking-detail-box"><span>Time</span><strong>${escapeHTML(b.time||"—")}</strong></div><div class="booking-detail-box"><span>Status</span><strong>${escapeHTML(b.status||"—")}</strong></div></div><p>${escapeHTML(b.notes||"No notes.")}</p>`;modal.classList.add("show")}
document.getElementById("closeBooking").addEventListener("click",()=>document.getElementById("bookingModal").classList.remove("show"));document.getElementById("bookingSearch").addEventListener("input",renderBookings);document.getElementById("bookingFilter").addEventListener("change",renderBookings);
function renderVehicles(){const vs=getDB().vehicles||[];document.getElementById("vehicleCount").textContent=vs.length;document.getElementById("vehicleList").innerHTML=vs.length?vs.map(v=>`<div class="vehicle-row"><div class="vehicle-avatar"><i class="fas fa-car"></i></div><div><strong>${escapeHTML(v.name||"Vehicle")}</strong><span>${escapeHTML(v.number||"—")}</span></div></div>`).join(""):`<div class="empty-state">No vehicles added yet.</div>`}
function renderFavorites(){const db=getDB(),favorites=Array.isArray(db.mechanics)?db.mechanics:[];document.getElementById("favoriteList").innerHTML=favorites.length?favorites.map(f=>`<div class="favorite-row"><div class="favorite-avatar"><i class="fas fa-screwdriver-wrench"></i></div><div class="favorite-info"><strong>${escapeHTML(f.name||"Mechanic")}</strong><span>${escapeHTML(f.address||(Array.isArray(f.services)?f.services.join(", "):"")||"Nearby service location")}</span></div><i class="fas fa-heart" title="Remove from favourites" style="cursor:pointer" onclick="removeFavorite(${JSON.stringify(String(f.id))})"></i></div>`).join(""):`<div class="empty-state">Your saved mechanics will appear here. Tap the heart icon on the Mechanics page to save one.</div>`}
function removeFavorite(id){const db=getDB();db.mechanics=(Array.isArray(db.mechanics)?db.mechanics:[]).filter(f=>String(f.id)!==String(id));window.AutoNexusSync.saveDB(db);renderFavorites()}
function logout(){localStorage.removeItem("loggedInUser");sessionStorage.removeItem("loggedInUser");window.location.href="../login.html"}

/* ---- Account Settings: Change Password + Log Out ---- */
function validNewPassword(password){return /^[A-Za-z0-9]{8,}$/.test(password)}
function setPasswordMessage(message,error=false){
    const el=document.getElementById("passwordMessage");
    if(!el)return;
    el.textContent=message;
    el.style.cssText="margin:0 0 14px;padding:10px 12px;border-radius:8px;font-size:13px;background:"+(error?"rgba(239,68,68,.12)":"rgba(200,169,106,.14)")+";color:"+(error?"#ef4444":"inherit");
}
function openPasswordModal(){
    document.getElementById("passwordForm").reset();
    setPasswordMessage("");
    document.getElementById("passwordModal").classList.add("show");
}
function closePasswordModal(){document.getElementById("passwordModal").classList.remove("show")}
document.getElementById("passwordSetting").addEventListener("click",openPasswordModal);
document.getElementById("closePassword").addEventListener("click",closePasswordModal);
document.getElementById("passwordModal").addEventListener("click",e=>{if(e.target.id==="passwordModal")closePasswordModal()});
document.getElementById("passwordForm").addEventListener("submit",e=>{
    e.preventDefault();
    const logged=currentUser();
    if(!logged){setPasswordMessage("You're not logged in.",true);return}
    const current=document.getElementById("currentPasswordInput").value;
    const next=document.getElementById("newPasswordInput").value;
    const confirmNext=document.getElementById("confirmNewPasswordInput").value;

    const users=JSON.parse(localStorage.getItem("autonexus_users")||"[]");
    const index=users.findIndex(u=>String(u.id)===String(logged.id)||u.email.toLowerCase()===String(logged.email).toLowerCase());
    if(index<0){setPasswordMessage("We couldn't find your account.",true);return}

    if(users[index].password!==current){setPasswordMessage("Current password is incorrect.",true);return}
    if(!validNewPassword(next)){setPasswordMessage("New password must be at least 8 letters/numbers.",true);return}
    if(next!==confirmNext){setPasswordMessage("New passwords do not match.",true);return}
    if(next===current){setPasswordMessage("New password must be different from your current password.",true);return}

    const updated={...users[index],password:next};
    users[index]=updated;
    localStorage.setItem("autonexus_users",JSON.stringify(users));
    if(localStorage.getItem("loggedInUser"))localStorage.setItem("loggedInUser",JSON.stringify(updated));
    else sessionStorage.setItem("loggedInUser",JSON.stringify(updated));

    setPasswordMessage("Password updated successfully.");
    setTimeout(closePasswordModal,700);
});
document.getElementById("logoutSetting").addEventListener("click",()=>{
    if(confirm("Log out of AutoNexus on this device?"))logout();
});

renderProfile();renderBookings();renderVehicles();renderFavorites();window.addEventListener("autonexus:data-updated",()=>{renderBookings();renderVehicles();renderFavorites()});
