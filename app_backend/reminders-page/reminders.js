const STORAGE_KEY="autonexus_reminders";
const DEFAULT_REMINDERS=[];
function getVehicles(){try{const s=localStorage.getItem("autonexus_vehicles");return s?JSON.parse(s):[]}catch{return[]}}
const storedReminders=localStorage.getItem(STORAGE_KEY);
let reminders;
if(storedReminders!==null){
    try{reminders=JSON.parse(storedReminders)}catch{reminders=[]}
}else{
    reminders=[];
    localStorage.setItem(STORAGE_KEY,JSON.stringify(reminders));
}
if(!Array.isArray(reminders)) reminders=[];

// Remove only the old built-in demo reminders from previous versions.
function saveReminders(){
    localStorage.setItem(STORAGE_KEY,JSON.stringify(reminders));
}

function renderVehicleOptions(selectedValue=""){
    const select=document.getElementById("reminderVehicle"), vehicles=getVehicles();
    if(!vehicles.length){select.innerHTML='<option value="">Add a vehicle first</option>';select.disabled=true;return}
    select.disabled=false;
    select.innerHTML=vehicles.map(v=>{const value=v.name||v.number||`Vehicle ${v.id}`;return `<option value="${escapeHTML(value)}" ${value===selectedValue?'selected':''}>${escapeHTML(value)}</option>`}).join('');
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

function formatDate(date){
    return new Date(date+"T00:00:00").toLocaleDateString("en-IN",{
        day:"2-digit",
        month:"short",
        year:"numeric"
    });
}

function daysUntil(date){
    const today = new Date();
    today.setHours(0,0,0,0);

    const due = new Date(date+"T00:00:00");

    return Math.ceil((due-today)/86400000);
}

function getState(reminder){
    if(reminder.completed){
        return {key:"completed",label:"Completed",dueClass:"due-complete"};
    }

    const days = daysUntil(reminder.date);

    if(days < 0){
        return {key:"overdue",label:"Overdue",dueClass:"due-overdue"};
    }

    if(days <= 7){
        return {key:"soon",label:"Due Soon",dueClass:"due-soon"};
    }

    return {key:"pending",label:"Upcoming",dueClass:"due-normal"};
}

function iconFor(category){
    const icons = {
        Service:"fa-screwdriver-wrench",
        Insurance:"fa-shield-halved",
        PUC:"fa-leaf",
        RC:"fa-id-card",
        Tyres:"fa-circle-dot",
        Battery:"fa-car-battery",
        Other:"fa-bell"
    };

    return icons[category] || "fa-bell";
}

function render(){
    const container = document.getElementById("reminderContainer");
    const query = document.getElementById("reminderSearch")
        .value.trim().toLowerCase();

    const statusFilter = document.getElementById("statusFilter").value;
    const categoryFilter = document.getElementById("categoryFilter").value;

    const filtered = reminders
        .filter(reminder=>{
            const state = getState(reminder);

            const text = [
                reminder.title,
                reminder.vehicle,
                reminder.category,
                reminder.notes
            ].join(" ").toLowerCase();

            const matchesSearch = text.includes(query);
            const matchesStatus =
                statusFilter === "all" || state.key === statusFilter;
            const matchesCategory =
                categoryFilter === "all" ||
                reminder.category === categoryFilter;

            return matchesSearch && matchesStatus && matchesCategory;
        })
        .sort((a,b)=>{
            if(a.completed !== b.completed) return a.completed ? 1 : -1;
            return new Date(a.date)-new Date(b.date);
        });

    if(!filtered.length){
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar-xmark"></i>
                <h3>No reminders found</h3>
                <p>Try another filter or add a new reminder.</p>
            </div>
        `;
    }else{
        container.innerHTML = filtered.map(reminder=>{
            const state = getState(reminder);
            const days = daysUntil(reminder.date);

            let dueText;

            if(reminder.completed){
                dueText = "Completed";
            }else if(days < 0){
                dueText = `${Math.abs(days)} day(s) overdue`;
            }else if(days === 0){
                dueText = "Today";
            }else if(days === 1){
                dueText = "Tomorrow";
            }else{
                dueText = `In ${days} days`;
            }

            return `
                <article class="reminder-card ${state.key}">
                    <div class="reminder-top">
                        <div class="reminder-icon ${reminder.category.toLowerCase()}">
                            <i class="fas ${iconFor(reminder.category)}"></i>
                        </div>
                        <span class="status ${state.key}">
                            ${state.label}
                        </span>
                    </div>

                    <h3>${escapeHTML(reminder.title)}</h3>

                    <p class="vehicle-line">
                        <i class="fas fa-car"></i>
                        ${escapeHTML(reminder.vehicle)}
                    </p>

                    <div class="reminder-info">
                        <div class="info-box">
                            <span>Due Date</span>
                            <strong>${formatDate(reminder.date)}</strong>
                        </div>

                        <div class="info-box">
                            <span>Countdown</span>
                            <strong class="${state.dueClass}">
                                ${dueText}
                            </strong>
                        </div>

                        <div class="info-box">
                            <span>Category</span>
                            <strong>${escapeHTML(reminder.category)}</strong>
                        </div>

                        <div class="info-box">
                            <span>Time</span>
                            <strong>${escapeHTML(formatTime(reminder.time))}</strong>
                        </div>
                    </div>

                    <div class="reminder-actions">
                        <button onclick="viewReminder(${reminder.id})">
                            <i class="fas fa-eye"></i> View
                        </button>

                        ${
                            reminder.completed
                            ? `<button class="complete"
                                      onclick="markPending(${reminder.id})">
                                    <i class="fas fa-rotate-left"></i> Undo
                               </button>`
                            : `<button class="complete"
                                      onclick="completeReminder(${reminder.id})">
                                    <i class="fas fa-check"></i> Done
                               </button>`
                        }

                        <button onclick="editReminder(${reminder.id})">
                            <i class="fas fa-pen"></i>
                        </button>

                        <button class="delete"
                                onclick="deleteReminder(${reminder.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </article>
            `;
        }).join("");
    }

    updateStats();
    renderCalendar();
}

function formatTime(time){
    if(!time) return "Any time";

    const [hours,minutes] = time.split(":").map(Number);
    const suffix = hours >= 12 ? "PM" : "AM";
    const h = hours % 12 || 12;

    return `${String(h).padStart(2,"0")}:${String(minutes).padStart(2,"0")} ${suffix}`;
}

function updateStats(){
    const pending = reminders.filter(r=>!r.completed);
    const dueSoon = pending.filter(r=>{
        const days = daysUntil(r.date);
        return days >= 0 && days <= 7;
    });

    const completed = reminders.filter(r=>r.completed);

    const now = new Date();
    const monthCount = reminders.filter(r=>{
        const date = new Date(r.date+"T00:00:00");
        return date.getMonth() === now.getMonth() &&
               date.getFullYear() === now.getFullYear();
    }).length;

    document.getElementById("totalCount").textContent = reminders.length;
    document.getElementById("dueSoonCount").textContent = dueSoon.length;
    document.getElementById("completedCount").textContent = completed.length;
    document.getElementById("monthCount").textContent = monthCount;

    // Notification bell badge is handled globally by autonexus-sync.js.
}

/* ADD / EDIT */

const modal = document.getElementById("reminderModal");
const form = document.getElementById("reminderForm");

document.getElementById("addReminderBtn").addEventListener("click",()=>{
    editingId = null;

    document.getElementById("modalTitle").textContent = "Add Reminder";
    form.reset();
    renderVehicleOptions();

    const today = new Date();
    const localDate =
        new Date(today.getTime()-today.getTimezoneOffset()*60000)
            .toISOString().split("T")[0];

    document.getElementById("reminderDate").value = localDate;
    document.getElementById("notificationToggle").checked = true;

    modal.classList.add("show");
});

document.getElementById("closeModal")
    .addEventListener("click",closeModal);

modal.addEventListener("click",e=>{
    if(e.target === modal) closeModal();
});

function closeModal(){
    modal.classList.remove("show");
    form.reset();
    editingId = null;
}

form.addEventListener("submit",e=>{
    e.preventDefault();

    const data = {
        title:document.getElementById("reminderTitle").value.trim(),
        vehicle:document.getElementById("reminderVehicle").value,
        category:document.getElementById("reminderCategory").value,
        date:document.getElementById("reminderDate").value,
        time:document.getElementById("reminderTime").value,
        notes:document.getElementById("reminderNotes").value.trim(),
        notify:document.getElementById("notificationToggle").checked
    };

    if(editingId){
        reminders = reminders.map(reminder =>
            reminder.id === editingId
            ? {...reminder,...data}
            : reminder
        );
    }else{
        reminders.push({
            id:Date.now(),
            ...data,
            completed:false
        });
    }

    saveReminders();
    closeModal();
    render();
});

/* VIEW */

const viewModal = document.getElementById("viewModal");

function viewReminder(id){
    const reminder = reminders.find(r=>r.id===id);
    if(!reminder) return;

    const state = getState(reminder);

    document.getElementById("viewContent").innerHTML = `
        <h2 class="detail-title">${escapeHTML(reminder.title)}</h2>
        <p class="detail-vehicle">
            <i class="fas fa-car"></i>
            ${escapeHTML(reminder.vehicle)}
        </p>

        <div class="detail-grid">
            <div class="detail-box">
                <span>Status</span>
                <strong>${state.label}</strong>
            </div>
            <div class="detail-box">
                <span>Category</span>
                <strong>${escapeHTML(reminder.category)}</strong>
            </div>
            <div class="detail-box">
                <span>Due Date</span>
                <strong>${formatDate(reminder.date)}</strong>
            </div>
            <div class="detail-box">
                <span>Time</span>
                <strong>${formatTime(reminder.time)}</strong>
            </div>
        </div>

        <div class="detail-notes">
            <strong>Notes</strong><br>
            ${escapeHTML(reminder.notes || "No notes added.")}
        </div>
    `;

    viewModal.classList.add("show");
}

document.getElementById("closeView")
    .addEventListener("click",()=>{
        viewModal.classList.remove("show");
    });

viewModal.addEventListener("click",e=>{
    if(e.target === viewModal){
        viewModal.classList.remove("show");
    }
});

/* EDIT */

function editReminder(id){
    const reminder = reminders.find(r=>r.id===id);
    if(!reminder) return;

    editingId = id;

    document.getElementById("modalTitle").textContent = "Edit Reminder";
    document.getElementById("reminderTitle").value = reminder.title;
    renderVehicleOptions(reminder.vehicle);
    document.getElementById("reminderVehicle").value = reminder.vehicle;
    document.getElementById("reminderCategory").value = reminder.category;
    document.getElementById("reminderDate").value = reminder.date;
    document.getElementById("reminderTime").value = reminder.time;
    document.getElementById("reminderNotes").value = reminder.notes || "";
    document.getElementById("notificationToggle").checked = reminder.notify !== false;

    modal.classList.add("show");
}

/* COMPLETE */

function completeReminder(id){
    reminders = reminders.map(reminder =>
        reminder.id === id
        ? {...reminder,completed:true}
        : reminder
    );

    saveReminders();
    render();
}

function markPending(id){
    reminders = reminders.map(reminder =>
        reminder.id === id
        ? {...reminder,completed:false}
        : reminder
    );

    saveReminders();
    render();
}

/* DELETE */

function deleteReminder(id){
    const reminder = reminders.find(r=>r.id===id);
    if(!reminder) return;

    if(!confirm(`Delete "${reminder.title}"?`)) return;

    reminders = reminders.filter(r=>r.id!==id);
    saveReminders();
    render();
}

/* SEARCH / FILTER */

document.getElementById("reminderSearch")
    .addEventListener("input",render);

document.getElementById("statusFilter")
    .addEventListener("change",render);

document.getElementById("categoryFilter")
    .addEventListener("change",render);

document.getElementById("globalSearch")
    .addEventListener("input",e=>{
        document.getElementById("reminderSearch").value = e.target.value;
        render();
    });

/* CALENDAR */

function renderCalendar(){
    const title = document.getElementById("calendarTitle");
    const grid = document.getElementById("calendarGrid");

    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    title.textContent = new Date(year,month,1)
        .toLocaleDateString("en-IN",{
            month:"long",
            year:"numeric"
        });

    const firstDay = new Date(year,month,1).getDay();
    const daysInMonth = new Date(year,month+1,0).getDate();
    const previousDays =
        new Date(year,month,0).getDate();

    const cells = [];

    for(let i=firstDay-1;i>=0;i--){
        cells.push({
            day:previousDays-i,
            current:false,
            date:null
        });
    }

    for(let day=1;day<=daysInMonth;day++){
        const date =
            `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

        cells.push({
            day,
            current:true,
            date
        });
    }

    while(cells.length<42){
        cells.push({
            day:cells.length-daysInMonth-firstDay+1,
            current:false,
            date:null
        });
    }

    const today = new Date();
    const todayString =
        `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

    grid.innerHTML = cells.map(cell=>{
        if(!cell.current){
            return `<div class="calendar-day">${cell.day}</div>`;
        }

        const hasReminder = reminders.some(r=>
            r.date === cell.date && !r.completed
        );

        return `
            <div class="calendar-day current-month
                ${cell.date===todayString ? "today" : ""}
                ${hasReminder ? "has-reminder" : ""}"
                onclick="calendarDayClick('${cell.date}')">
                ${cell.day}
            </div>
        `;
    }).join("");
}

function calendarDayClick(date){
    const dayReminders=reminders.filter(r=>r.date===date);
    let modal=document.getElementById("calendarReminderModal");
    if(!modal){modal=document.createElement("div");modal.id="calendarReminderModal";modal.className="modal";document.body.appendChild(modal)}
    const stateLabel=r=>getState(r).label;
    modal.innerHTML=`<div class="modal-content calendar-reminder-modal"><button class="close" type="button" onclick="closeCalendarReminderModal()">&times;</button><span class="section-label">CALENDAR</span><h2>${escapeHTML(formatDate(date))}</h2><p class="modal-subtitle">${dayReminders.length?`${dayReminders.length} reminder(s) scheduled for this date.`:"No reminders are scheduled for this date."}</p>${dayReminders.length?`<div class="calendar-reminder-list">${dayReminders.map(r=>`<article class="calendar-reminder-item"><div><strong>${escapeHTML(r.title||"Reminder")}</strong><span>${escapeHTML(r.vehicle||"Vehicle")} • ${escapeHTML(r.category||"Vehicle")}</span></div><div><b>${escapeHTML(r.time||"Time not set")}</b><span>${stateLabel(r)}</span></div><p>${escapeHTML(r.notes||"No notes.")}</p></article>`).join("")}</div>`:`<div class="empty-state"><i class="fas fa-calendar-xmark"></i><h3>No reminders</h3><p>Add a reminder for this date using the reminder form.</p></div>`}</div>`;
    modal.classList.add("show");
}
function closeCalendarReminderModal(){const m=document.getElementById("calendarReminderModal");if(m)m.classList.remove("show")}

document.getElementById("prevMonth")
    .addEventListener("click",()=>{
        calendarDate.setMonth(calendarDate.getMonth()-1);
        renderCalendar();
    });

document.getElementById("nextMonth")
    .addEventListener("click",()=>{
        calendarDate.setMonth(calendarDate.getMonth()+1);
        renderCalendar();
    });

/* QUICK ACTIONS */

document.getElementById("serviceAction")
    .addEventListener("click",()=>{
        window.location.href="../mechanics-page/mechanics.html";
    });

document.getElementById("documentAction")
    .addEventListener("click",()=>{
        window.location.href="../documents-page/documents.html";
    });

document.getElementById("vehicleAction")
    .addEventListener("click",()=>{
        window.location.href="../my-vehicle-page/my-vehicle.html";
    });

/* NOTIFICATIONS */

/* LOCATION / SOS */

const sosMenuEl = document.getElementById("sosMenu");
if(sosMenuEl){
    sosMenuEl.addEventListener("click",()=>{
        if(confirm("Request emergency roadside assistance?")){
            alert(
                "🚨 Emergency assistance request sent.\n\n" +
                "A nearby assistance provider will be contacted."
            );
        }
    });
}

function logout(){
    localStorage.removeItem("loggedInUser");
    sessionStorage.removeItem("loggedInUser");
    window.location.href="../login.html";
}

reloadRemindersFromStorage();
renderVehicleOptions();
render();

window.addEventListener("autonexus:data-updated",()=>{
    reloadRemindersFromStorage();
    renderVehicleOptions(document.getElementById("reminderVehicle").value);
    render();
});
