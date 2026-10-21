/* AutoNexus shared data + navigation layer
   Loaded before each page-specific script.
   Keeps the dashboard and feature pages on the same localStorage data model.
*/
(function(){
    const DB_KEY = "autonexus_database";
    const ARRAY_KEYS = {
        vehicles:"autonexus_vehicles",
        bookings:"autonexus_bookings",
        reminders:"autonexus_reminders",
        notifications:"autonexus_notifications",
        activities:"autonexus_activities",
        documents:"autonexus_documents",
        expenses:"autonexus_expenses",
        fuelLogs:"autonexus_fuel_logs",
        services:"autonexus_services",
        // Every SOS request (from the dashboard quick action or the full
        // Emergency SOS page) lives under this single key so the counts
        // shown on every page always agree.
        sosEvents:"autonexus_sos_history",
        // BUGFIX: Emergency SOS contacts were previously stored only under
        // the raw "autonexus_emergency_contacts" key, which this sync layer
        // didn't know about. That meant contacts never got folded into each
        // user's isolated snapshot below - every account shared literally
        // the same contacts list, and the same bug would apply to any other
        // page-local key that isn't listed here. Registering it in
        // ARRAY_KEYS makes it go through the same per-user isolation as
        // vehicles/documents/reminders/etc.
        emergencyContacts:"autonexus_emergency_contacts"
    };

    const defaults = {
        vehicles:[], documents:[], bookings:[], reminders:[],
        notifications:[], mechanics:[], services:[], expenses:[],
        fuelLogs:[], activities:[], sosEvents:[], emergencyContacts:[],
        settings:{theme:"dark",currency:"₹"}
    };

    function read(key, fallback){
        try{
            const raw = localStorage.getItem(key);
            return raw === null ? fallback : JSON.parse(raw);
        }catch{return fallback;}
    }

    function writeRaw(key,value){
        originalSetItem.call(localStorage,key,JSON.stringify(value));
    }

    /* ---------------------------------------------------------------- *
     *  Storage self-test.
     *
     *  BUGFIX: previously, if a browser/host environment silently failed
     *  to persist localStorage (private-browsing modes that accept
     *  writes but don't keep them, sandboxed preview iframes without
     *  storage access, storage quota errors, etc.), the app gave no
     *  indication anything was wrong - the newly added vehicle/booking
     *  would still render for the rest of that page session (because the
     *  in-memory array was already updated) and then quietly vanish the
     *  moment the page was reloaded or navigated away from. That is
     *  exactly the symptom of "it saves until I refresh, then it's
     *  gone" - and it happens with NO thrown error to catch, so try/catch
     *  alone can't detect it.
     *
     *  We now round-trip a probe value through localStorage on load and
     *  again after every write, and surface a persistent on-page banner
     *  the moment persistence looks unreliable, so the problem is
     *  visible instead of silent.
     * ---------------------------------------------------------------- */
    const PROBE_KEY="__autonexus_storage_probe__";
    let storageReliable=true;
    function storageRoundTripOK(){
        try{
            const value="ok-"+Date.now();
            originalSetItem.call(localStorage,PROBE_KEY,value);
            const readBack=localStorage.getItem(PROBE_KEY);
            originalRemoveItem.call(localStorage,PROBE_KEY);
            return readBack===value;
        }catch{return false;}
    }
    function showStorageWarning(){
        if(document.getElementById("autonexusStorageWarning")) return;
        const bar=document.createElement("div");
        bar.id="autonexusStorageWarning";
        bar.style.cssText="position:fixed;top:0;left:0;right:0;z-index:999999;background:#ef4444;color:#fff;font:600 13px/1.4 system-ui,sans-serif;padding:10px 16px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.3)";
        bar.textContent="Your browser is blocking or not keeping local storage here, so nothing you add (vehicles, bookings, reminders, etc.) will still be there after a refresh. Try opening this app in a normal browser tab instead of a preview/incognito window, or allow site data for this page.";
        const mount=()=>document.body && document.body.prepend(bar);
        if(document.body) mount(); else document.addEventListener("DOMContentLoaded",mount);
    }
    function checkStorageHealth(){
        storageReliable=storageRoundTripOK();
        if(!storageReliable) showStorageWarning();
        return storageReliable;
    }

    function mergeById(target,incoming){
        if(!Array.isArray(target)) target=[];
        if(!Array.isArray(incoming)) return target;
        const map = new Map(target.map(x=>[String(x.id),x]));
        incoming.forEach(item=>{
            if(!item || item.id === undefined) return;
            const id=String(item.id);
            map.set(id,{...(map.get(id)||{}),...item});
        });
        return Array.from(map.values());
    }

    const originalSetItem = localStorage.setItem.bind(localStorage);
    const originalRemoveItem = localStorage.removeItem.bind(localStorage);

    // One-time migration: an earlier build recorded quick-SOS pings from the
    // dashboard under a separate "autonexus_sos_events" key, so counts there
    // never matched the real request history on the Emergency SOS page.
    // Fold anything left in the old key into the unified history and retire it.
    (function migrateLegacySOSKey(){
        try{
            const legacy = read("autonexus_sos_events",null);
            if(!Array.isArray(legacy) || !legacy.length) return;

            const history = read("autonexus_sos_history",[]);
            const merged = Array.isArray(history) ? history.slice() : [];
            const seen = new Set(merged.map(item=>String(item.id)));

            legacy.forEach(event=>{
                const id = event.id !== undefined ? event.id : Date.now()+Math.random();
                if(seen.has(String(id))) return;
                seen.add(String(id));

                merged.push({
                    id,
                    type:"Quick SOS",
                    details:"Captured from the Dashboard quick action.",
                    time:event.time || new Date().toISOString(),
                    location:(event.lat!==undefined && event.lng!==undefined)
                        ? {latitude:event.lat,longitude:event.lng}
                        : null
                });
            });

            writeRaw("autonexus_sos_history",merged);
            originalRemoveItem.call(localStorage,"autonexus_sos_events");
        }catch{}
    })();

    const AUTH_DATA_KEY = "autonexus_user_databases";
    function getAuthUser(){
        try{return JSON.parse(localStorage.getItem("loggedInUser")) || JSON.parse(sessionStorage.getItem("loggedInUser")) || null;}catch{return null;}
    }
    function authId(){const u=getAuthUser(); return u && u.id!=null ? String(u.id) : null;}
    function readUserDatabases(){return read(AUTH_DATA_KEY,{});} 
    function persistCurrentUserDB(value){
        const id=authId();
        if(!id) return;
        const all=readUserDatabases();
        all[id]=value;
        originalSetItem(AUTH_DATA_KEY,JSON.stringify(all));
    }
    const existingDB = read(DB_KEY,null);
    const currentUserId=authId();
    const userDatabases=readUserDatabases();
    let userDB=currentUserId ? userDatabases[currentUserId] : null;
    // On first login, adopt the existing database once. Afterwards every user
    // gets an isolated snapshot while the public shared key remains the single
    // source of truth for the currently authenticated user.
    //
    // BUGFIX: this used to check only "!userDB" (this user has no saved
    // snapshot yet), which meant EVERY brand-new account - not just the
    // very first one - inherited whatever was left in the shared DB_KEY
    // by whichever user was previously logged in, then permanently saved
    // that as its own data. Restricting the adoption to "no user has ever
    // been given a personal snapshot yet" (Object.keys(userDatabases)
    // is empty) makes it a true one-time migration: it only fires for the
    // first user who logs in after this multi-user system was introduced.
    // Every subsequent new account starts from a clean, empty database.
    const isFirstEverLogin = Object.keys(userDatabases).length===0;
    if(currentUserId && !userDB && isFirstEverLogin && existingDB && typeof existingDB === "object"){
        userDB=existingDB;
    }
    // BUGFIX: when nobody is logged in (currentUserId is null - this
    // happens easily since most pages here don't force a redirect to
    // login, and a session is only ever recorded once someone actually
    // submits the login form), this used to unconditionally fall back to
    // a brand-new {...defaults} database AND immediately overwrite
    // DB_KEY with it a few lines below - wiping out everything that had
    // been saved, on every single page load/refresh, for anyone not
    // logged in. An unauthenticated/guest session should just keep using
    // whatever is already in the shared database, the same as before
    // multi-user accounts existed; only truly first-ever use (nothing in
    // DB_KEY yet) should start from a clean slate.
    let db;
    if(userDB && typeof userDB === "object"){
        // Returning user (or the one-time first-ever-login migration
        // above) - always use their own isolated snapshot.
        db = userDB;
    }else if(!currentUserId && existingDB && typeof existingDB === "object"){
        // Nobody is logged in (guest/unauthenticated session) - keep
        // using whatever is already in the shared database instead of
        // wiping it on every reload. This must NOT apply when a
        // specific different user is logged in with no snapshot of
        // their own yet, or they'd inherit another account's data.
        db = existingDB;
    }else{
        db = {...defaults};
    }
    Object.keys(defaults).forEach(k=>{
        if(Array.isArray(defaults[k]) && !Array.isArray(db[k])) db[k]=[];
    });
    if(!db.settings) db.settings={...defaults.settings};
    if(!existingDB){
        Object.entries(ARRAY_KEYS).forEach(([dbField,key])=>{
            const legacy=read(key,null);
            if(Array.isArray(legacy) && legacy.length) db[dbField]=legacy;
        });
    }
    // BUGFIX: these bootstrap writes previously called originalSetItem
    // directly with no error handling. In an environment where storage is
    // completely unavailable (fully sandboxed iframe, storage disabled at
    // the browser level, etc.) this used to throw right here and abort the
    // rest of the IIFE - meaning `window.AutoNexusSync` was never even
    // defined, and every page's script (my-vehicle.js, mechanics-map.js,
    // dashboard.js...) would then crash with generic "Cannot read
    // properties of undefined" errors instead of the clear storage warning
    // this file is otherwise able to show.
    try{
        if(currentUserId) persistCurrentUserDB(db);
        originalSetItem(DB_KEY,JSON.stringify(db));
        Object.entries(ARRAY_KEYS).forEach(([dbField,key])=>{
            if(Array.isArray(db[dbField])) originalSetItem(key,JSON.stringify(db[dbField]));
        });
    }catch{
        // Fall through - AutoNexusSync still gets defined below so pages can
        // keep working against the in-memory `db` for this session, and
        // checkStorageHealth() (called after bindGlobalUI) will surface
        // the warning banner once the DOM is ready.
    }

    // Keep every store in sync no matter which one a page writes to:
    // - writing a page-level key updates the shared DB
    // - writing the shared DB pushes the change back out to every page-level key
    // Both directions bypass this wrapper (via originalSetItem) so neither can loop.
    localStorage.setItem=function(key,value){
        // BUGFIX: originalSetItem used to be called unguarded here. If the
        // browser/host throws on write (quota exceeded, storage blocked in
        // a sandboxed iframe, etc.) that exception used to propagate all
        // the way up into whatever page code called localStorage.setItem
        // (e.g. a form-submit handler), aborting everything after it -
        // including the UI update that was supposed to happen next. Now
        // we catch it, run a storage health check so the person gets a
        // visible warning, and re-throw only so callers that DO have
        // their own try/catch can still react - callers that don't will
        // simply see the write silently fail rather than the rest of
        // their handler being skipped.
        try{
            originalSetItem(key,value);
        }catch(err){
            checkStorageHealth();
            throw err;
        }

        if(key===DB_KEY){
            try{
                const incoming=JSON.parse(value);
                if(currentUserId) persistCurrentUserDB(incoming);
                Object.entries(ARRAY_KEYS).forEach(([field,legacyKey])=>{
                    if(Array.isArray(incoming[field])){
                        originalSetItem(legacyKey,JSON.stringify(incoming[field]));
                    }
                });
                window.dispatchEvent(new CustomEvent("autonexus:data-updated",{detail:{field:"*"}}));
            }catch{}
            return;
        }

        const field=Object.entries(ARRAY_KEYS).find(([,k])=>k===key)?.[0];
        if(!field) return;

        try{
            const incoming=JSON.parse(value);
            if(!Array.isArray(incoming)) return;
            const latest=read(DB_KEY,{...defaults});
            // A page writes its complete collection, so removals must also propagate.
            latest[field]=incoming;
            if(currentUserId) persistCurrentUserDB(latest);
            originalSetItem(DB_KEY,JSON.stringify(latest));
            window.dispatchEvent(new CustomEvent("autonexus:data-updated",{detail:{field}}));
        }catch{}
    };

    // If a page is open in another tab, refresh it so all views stay current.
    window.addEventListener("storage",e=>{
        if(e.key===DB_KEY || Object.values(ARRAY_KEYS).includes(e.key)){
            window.dispatchEvent(new CustomEvent("autonexus:data-updated",{detail:{field:e.key}}));
        }
    });

    /* ---------------------------------------------------------------- *
     *  Shared vehicle helpers — used by the Dashboard, My Vehicles and
     *  AI Assistant pages so the "active" vehicle and its health score
     *  are always computed the exact same way everywhere.
     * ---------------------------------------------------------------- */

    function getActiveVehicle(vehicles){
        if(!Array.isArray(vehicles) || !vehicles.length) return null;
        return vehicles.find(v=>v.active) || vehicles[0];
    }

    // Marks exactly one vehicle as active (mutates the array in place) and
    // returns it. Every page should call this instead of touching
    // `.active` directly so only one vehicle is ever "selected" at a time.
    function setActiveVehicle(vehicles,id){
        if(!Array.isArray(vehicles)) return null;
        const key=String(id);
        let match=null;
        vehicles.forEach(v=>{
            v.active = String(v.id)===key;
            if(v.active) match=v;
        });
        return match;
    }

    function daysRemaining(date){
        if(!date) return Infinity;
        const target=new Date(date+"T23:59:59");
        const today=new Date();
        return Math.ceil((target.getTime()-today.getTime())/(1000*60*60*24));
    }

    function daysSince(date){
        if(!date) return null;
        const then=new Date(date+"T00:00:00");
        if(Number.isNaN(then.getTime())) return null;
        const now=new Date();
        return Math.max(0,Math.floor((now.getTime()-then.getTime())/(1000*60*60*24)));
    }

    function formatDate(date){
        if(!date) return "--";
        const parsed=new Date(String(date).includes("T") ? date : date+"T00:00:00");
        if(Number.isNaN(parsed.getTime())) return date;
        return parsed.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
    }

    // Shared maintenance intervals. Health deteriorates gradually early in a
    // component's life and accelerates smoothly near its expected interval.
    const HEALTH_INTERVALS = {engineDays:365,engineKm:12000,tyreDays:365*3,brakeDays:365*2,batteryDays:365*5};
    const UNKNOWN_HEALTH=70;
    function smoothHealth(ratio){
        if(!Number.isFinite(ratio)) return UNKNOWN_HEALTH;
        const r=Math.max(0,ratio);
        if(r<=1) return Math.round(100-40*Math.pow(r,2));
        const extra=Math.min(2,r-1);
        return Math.max(5,Math.round(60-40*Math.pow(extra/2,1.25)));
    }
    function computeVehicleHealth(vehicle){
        if(!vehicle) return {engine:0,tyre:0,brake:0,battery:0,overall:0};
        const serviceDays=daysSince(vehicle.lastServiceDate);
        const mileageKnown=vehicle.lastServiceMileage!==undefined && vehicle.lastServiceMileage!==null && vehicle.lastServiceMileage!=="" && vehicle.mileage!==undefined && vehicle.mileage!==null && vehicle.mileage!=="";
        const kmSince=mileageKnown?Math.max(0,Number(vehicle.mileage)-Number(vehicle.lastServiceMileage)):null;
        const dayRatio=serviceDays===null?0:serviceDays/HEALTH_INTERVALS.engineDays;
        const kmRatio=kmSince===null?0:kmSince/HEALTH_INTERVALS.engineKm;
        const engine=(serviceDays===null && kmSince===null)?UNKNOWN_HEALTH:smoothHealth(Math.max(dayRatio,kmRatio));
        const tyreDays=daysSince(vehicle.tyresChangedDate);
        const brakeDays=daysSince(vehicle.brakesChangedDate);
        const batteryDays=daysSince(vehicle.batteryChangedDate);
        const tyre=tyreDays===null?UNKNOWN_HEALTH:smoothHealth(tyreDays/HEALTH_INTERVALS.tyreDays);
        const brake=brakeDays===null?UNKNOWN_HEALTH:smoothHealth(brakeDays/HEALTH_INTERVALS.brakeDays);
        const battery=batteryDays===null?UNKNOWN_HEALTH:smoothHealth(batteryDays/HEALTH_INTERVALS.batteryDays);
        const overall=Math.round(engine*.35+tyre*.25+brake*.20+battery*.20);
        return {engine,tyre,brake,battery,overall};
    }

    // Only ever returns reminders the person actually created (Reminders
    // page) — never auto-generated insurance/service nudges.
    function getUpcomingReminders(reminders,limit){
        const cap = limit || 5;
        return (Array.isArray(reminders) ? reminders : [])
            .filter(r=>!r.completed)
            .slice()
            .sort((a,b)=> new Date(a.date||"9999-12-31") - new Date(b.date||"9999-12-31"))
            .slice(0,cap);
    }

    function escapeForHTML(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
    function getSharedNotifications(){
        const reminders=read(ARRAY_KEYS.reminders,[])||[], docs=read(ARRAY_KEYS.documents,[])||[];
        const now=new Date(); now.setHours(0,0,0,0); const items=[];
        (Array.isArray(reminders)?reminders:[]).forEach(r=>{if(r.completed||!r.date)return;const d=new Date(r.date+"T00:00:00");if(Number.isNaN(d.getTime()))return;const days=Math.ceil((d-now)/86400000);if(days<=7)items.push({type:"Reminder",title:r.title||"Reminder",detail:days<0?`${Math.abs(days)} day(s) overdue`:days===0?"Due today":`Due in ${days} day(s)`,date:r.date});});
        (Array.isArray(docs)?docs:[]).forEach(d=>{if(!d.expiry)return;const exp=new Date(d.expiry+"T00:00:00");if(Number.isNaN(exp.getTime()))return;const days=Math.ceil((exp-now)/86400000);if(days<=30)items.push({type:"Document",title:d.name||"Document",detail:days<0?"Expired":days===0?"Expires today":`Expires in ${days} day(s)`,date:d.expiry});});
        const stored=read(ARRAY_KEYS.notifications,[]);
        (Array.isArray(stored)?stored:[]).forEach(n=>{
            if(!n || n.dismissed || n.read) return;
            items.push({type:n.type||"AutoNexus",title:n.title||"AutoNexus notification",detail:n.detail||n.message||"Action may require your attention.",date:n.date||new Date().toISOString().slice(0,10)});
        });
        return items.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    }
    function updateSharedNotificationUI(){const items=getSharedNotifications();document.querySelectorAll("#notificationCount").forEach(el=>{el.textContent=items.length;el.style.display=items.length?"inline-flex":"none";});}
    function openSharedNotifications(){
        let d=document.getElementById("autonexusSharedNotifications");
        if(!d){d=document.createElement("aside");d.id="autonexusSharedNotifications";d.innerHTML=`<div class="shared-notification-backdrop"></div><div class="shared-notification-panel"><div class="shared-notification-head"><div><span class="section-label">LIVE</span><h2>Notifications</h2></div><button id="closeSharedNotifications" type="button">&times;</button></div><div id="sharedNotificationList"></div></div>`;document.body.appendChild(d);const style=document.createElement("style");style.textContent=`#autonexusSharedNotifications{position:fixed;inset:0;z-index:99999;pointer-events:none}.shared-notification-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.45);opacity:0;transition:.2s}.shared-notification-panel{position:absolute;right:0;top:0;height:100%;width:min(420px,92vw);padding:24px;background:var(--card,#111827);color:var(--text,#fff);transform:translateX(100%);transition:.25s;box-shadow:-20px 0 50px rgba(0,0,0,.25)}#autonexusSharedNotifications.open{pointer-events:auto}.open .shared-notification-backdrop{opacity:1}.open .shared-notification-panel{transform:translateX(0)}.shared-notification-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid var(--border,rgba(255,255,255,.12));padding-bottom:16px}.shared-notification-head button{border:0;background:transparent;color:inherit;font-size:28px;cursor:pointer}.shared-notification-item{padding:16px 0;border-bottom:1px solid var(--border,rgba(255,255,255,.12));display:flex;flex-direction:column;gap:5px}.shared-notification-item span{opacity:.75;font-size:13px}.shared-notification-empty{padding:40px 0;text-align:center;opacity:.7}`;document.head.appendChild(style);d.querySelector(".shared-notification-backdrop").onclick=closeSharedNotifications;d.querySelector("#closeSharedNotifications").onclick=closeSharedNotifications;}
        const list=d.querySelector("#sharedNotificationList"),items=getSharedNotifications();list.innerHTML=items.length?items.map(n=>`<div class="shared-notification-item"><strong>${escapeForHTML(n.title)}</strong><span>${escapeForHTML(n.type)} • ${escapeForHTML(n.detail)}</span></div>`).join(""):`<div class="shared-notification-empty">No notifications right now.</div>`;d.classList.add("open");
    }
    function closeSharedNotifications(){const d=document.getElementById("autonexusSharedNotifications");if(d)d.classList.remove("open");}
    function applyTheme(theme){const value=theme==="light"?"light":"dark";document.documentElement.classList.toggle("light",value==="light");originalSetItem("autonexus_theme",value);const latest=read(DB_KEY,{...defaults});latest.settings={...(latest.settings||{}),theme:value};originalSetItem(DB_KEY,JSON.stringify(latest));document.querySelectorAll("#themeBtn").forEach(btn=>{const i=btn.querySelector("i");if(i){i.classList.toggle("fa-sun",value==="light");i.classList.toggle("fa-moon",value!=="light");}});}
    function bindGlobalUI(){
        applyTheme(read("autonexus_theme",null)||(read(DB_KEY,{settings:{theme:"dark"}}).settings?.theme||"dark"));
        document.addEventListener("click",e=>{const n=e.target.closest("#notificationBtn,.notification");if(n){e.preventDefault();e.stopImmediatePropagation();openSharedNotifications();return;}const t=e.target.closest("#themeBtn");if(t){e.preventDefault();e.stopImmediatePropagation();applyTheme(document.documentElement.classList.contains("light")?"dark":"light");}},true);
        window.addEventListener("autonexus:data-updated",updateSharedNotificationUI);updateSharedNotificationUI();
    }
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bindGlobalUI);else bindGlobalUI();
    checkStorageHealth();

    window.AutoNexusSync={
        DB_KEY,
        read,
        getDB:()=>read(DB_KEY,{...defaults}),
        saveDB(next){localStorage.setItem(DB_KEY,JSON.stringify(next));},
        // Same as saveDB, but never throws and reports success/failure so
        // page code can show the person a toast instead of the change
        // just quietly not sticking.
        saveDBSafe(next){
            try{
                localStorage.setItem(DB_KEY,JSON.stringify(next));
                return checkStorageHealth();
            }catch{
                showStorageWarning();
                return false;
            }
        },
        isStorageReliable:()=>storageReliable,
        getCurrentUserId:()=>authId(),
        refreshLegacyStores(){
            const latest=read(DB_KEY,{...defaults});
            Object.entries(ARRAY_KEYS).forEach(([field,key])=>{
                if(Array.isArray(latest[field])) writeRaw(key,latest[field]);
            });
        },
        getActiveVehicle,
        setActiveVehicle,
        computeVehicleHealth,
        daysRemaining,
        daysSince,
        formatDate,
        getUpcomingReminders,
        getSharedNotifications,
        updateSharedNotificationUI,
        applyTheme
    };
})();
