// BUGFIX: this used to be a single flat "autonexus_ai_chat" key shared by
// EVERY account on the same browser - unlike vehicles/bookings/reminders
// (which all live inside the per-user database that autonexus-sync.js keeps
// isolated per logged-in user), the chat history was never namespaced, so
// User B would see User A's AI Assistant conversation the moment they
// logged in on the same device. Namespacing the key by the current
// account (falling back to a shared "guest" bucket when nobody is logged
// in) keeps this page consistent with how every other page already
// isolates data.
const CHAT_KEY_BASE = "autonexus_ai_chat";
const REMINDERS_KEY = "autonexus_reminders";

function currentChatKey(){
    const uid = window.AutoNexusSync && window.AutoNexusSync.getCurrentUserId ? window.AutoNexusSync.getCurrentUserId() : null;
    return uid ? `${CHAT_KEY_BASE}:${uid}` : `${CHAT_KEY_BASE}:guest`;
}
const CHAT_KEY = currentChatKey();

const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const typing = document.getElementById("typing");

let messages = JSON.parse(localStorage.getItem(CHAT_KEY)) || [];

function saveChat(){
    try{
        localStorage.setItem(CHAT_KEY,JSON.stringify(messages));
    }catch{
        if(window.AutoNexusSync && window.AutoNexusSync.isStorageReliable && !window.AutoNexusSync.isStorageReliable()){
            // Storage warning banner is already shown by autonexus-sync.js.
        }
    }
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

function timeNow(){
    return new Date().toLocaleTimeString("en-IN",{
        hour:"2-digit",
        minute:"2-digit"
    });
}

function addMessage(sender,text,save=true){
    const message = {
        sender,
        text,
        time:timeNow()
    };

    if(save){
        messages.push(message);
        saveChat();
    }

    renderMessage(message);
}

function renderMessage(message){
    const isUser = message.sender === "user";

    const wrapper = document.createElement("div");
    wrapper.className = `message ${isUser ? "user" : "ai"}`;

    wrapper.innerHTML = `
        <div class="message-avatar">
            <i class="fas ${isUser ? "fa-user" : "fa-robot"}"></i>
        </div>

        <div>
            <div class="bubble">${formatAIText(message.text)}</div>
            <div class="message-time">${escapeHTML(message.time)}</div>
        </div>
    `;

    chatMessages.appendChild(wrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatAIText(text){
    let safe = escapeHTML(text);

    safe = safe.replace(
        /\*\*(.*?)\*\*/g,
        "<strong>$1</strong>"
    );

    safe = safe.replace(
        /\n/g,
        "<br>"
    );

    return safe;
}

function initializeChat(){
    if(messages.length){
        messages.forEach(renderMessage);
        return;
    }

    addMessage(
        "ai",
        "Hi! I'm **AutoNexus AI**, your vehicle assistant. 🚗\n\n" +
        "I can help with troubleshooting, maintenance, mileage, repair costs and finding mechanics — " +
        "and I can also look up **your own vehicle's saved data**. Try asking \"when's my next service?\" or \"what's my vehicle health?\"",
        true
    );
}

function showTyping(){
    typing.classList.add("show");
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideTyping(){
    typing.classList.remove("show");
}

function sendMessage(text){
    const cleaned = text.trim();

    if(!cleaned) return;

    addMessage("user",cleaned,true);
    chatInput.value = "";

    showTyping();

    setTimeout(()=>{
        hideTyping();

        const response = generateResponse(cleaned);
        addMessage("ai",response,true);
    },650 + Math.random()*500);
}

/*
    This is a front-end AI assistant prototype.
    The response engine below gives useful rule-based vehicle guidance,
    and answers questions about the person's OWN active vehicle using its
    real saved data (service history, insurance, tyres, brakes, battery).
    You can later replace generateResponse() with an OpenAI/backend API call.
*/

/* ---- Vehicle-aware answers (checked before generic troubleshooting) ---- */

function getChatVehicle(){
    const vehicles = getVehicles();
    if(!vehicles.length) return null;
    return window.AutoNexusSync.getActiveVehicle(vehicles);
}

function noVehicleReply(){
    return "You don't have a vehicle added yet. 🚗\n\n" +
        "Add one on the **My Vehicles** page — once it's there I can answer " +
        "questions about its service history, insurance, tyres, brakes and battery.";
}

// Estimates the next service using whichever comes first: ~10,000 km since
// the last service, or ~6 months since the last service date — the same
// interval used for the vehicle health score, so the two stay consistent.
function nextServiceEstimate(vehicle){
    const today = new Date();
    let dueByDate = null;

    if(vehicle.lastServiceDate){
        const last = new Date(vehicle.lastServiceDate+"T00:00:00");
        dueByDate = new Date(last);
        dueByDate.setDate(dueByDate.getDate()+180);
    }

    let kmRemaining = null;
    if(
        vehicle.lastServiceMileage!==undefined && vehicle.lastServiceMileage!=="" &&
        vehicle.mileage!==undefined && vehicle.mileage!==""
    ){
        const kmSinceService = Number(vehicle.mileage) - Number(vehicle.lastServiceMileage);
        kmRemaining = 10000 - kmSinceService;
    }

    return {dueByDate,kmRemaining};
}

function tryVehicleDataAnswer(q){
    const wantsOwnVehicle =
        q.includes("my vehicle") || q.includes("my car") || q.includes("my bike") ||
        q.includes("this vehicle") || q.includes("this car");

    // "next service" / "service due" / "when should I service"
    if(
        (q.includes("service") || q.includes("servicing")) &&
        (q.includes("next") || q.includes("due") || q.includes("when") || q.includes("overdue"))
    ){
        const vehicle = getChatVehicle();
        if(!vehicle) return noVehicleReply();

        const {dueByDate,kmRemaining} = nextServiceEstimate(vehicle);
        let lines = [`**Service status for ${vehicle.name}${vehicle.number ? " ("+vehicle.number+")" : ""}:**\n`];

        if(vehicle.lastServiceDate){
            lines.push(`• Last service: ${window.AutoNexusSync.formatDate(vehicle.lastServiceDate)}`);
        }else{
            lines.push("• No last-service date on file yet — add one on the My Vehicles page for an accurate estimate.");
        }

        if(dueByDate){
            const daysLeft = Math.ceil((dueByDate - new Date())/(1000*60*60*24));
            lines.push(
                daysLeft < 0
                    ? `• Time-based service window: **overdue by ${Math.abs(daysLeft)} day(s)** (~every 6 months).`
                    : `• Time-based next service: due around **${window.AutoNexusSync.formatDate(dueByDate.toISOString().split("T")[0])}** (in ${daysLeft} day(s)).`
            );
        }

        if(kmRemaining!==null){
            lines.push(
                kmRemaining <= 0
                    ? `• Distance-based service window: **overdue by ${Math.abs(kmRemaining).toLocaleString("en-IN")} km** (~every 10,000 km).`
                    : `• Distance-based next service: due in about **${kmRemaining.toLocaleString("en-IN")} km**.`
            );
        }

        lines.push("\nWhichever limit comes first is usually the right one to follow. You can log the actual service on the **My Vehicles** page once it's done.");
        return lines.join("\n");
    }

    // Insurance expiry
    if(
        q.includes("insurance") &&
        (q.includes("due") || q.includes("expir") || q.includes("renew") || q.includes("when") || wantsOwnVehicle)
    ){
        const vehicle = getChatVehicle();
        if(!vehicle) return noVehicleReply();
        if(!vehicle.insurance) return `I don't have an insurance expiry date on file for **${vehicle.name}**. Add one on the My Vehicles page.`;

        const days = window.AutoNexusSync.daysRemaining(vehicle.insurance);
        return `**${vehicle.name}'s insurance:**\n\n` +
            `Expiry date: ${window.AutoNexusSync.formatDate(vehicle.insurance)}\n` +
            (days < 0
                ? `⚠️ This has **expired ${Math.abs(days)} day(s) ago**. Renew it as soon as possible — driving with expired insurance is a legal risk.`
                : days <= 30
                    ? `⏰ Renewal is coming up in **${days} day(s)**. Worth renewing soon to avoid a lapse.`
                    : `✅ Valid for another **${days} day(s)**.`);
    }

    // Tyres / brakes / battery — "when was it last changed"
    const partMap = [
        {keys:["tyre","tire"],field:"tyresChangedDate",label:"tyres",interval:"~3 years / 40,000 km"},
        {keys:["brake"],field:"brakesChangedDate",label:"brakes",interval:"~2 years"},
        {keys:["battery"],field:"batteryChangedDate",label:"battery",interval:"~3 years"}
    ];

    for(const part of partMap){
        const mentionsPart = part.keys.some(k=>q.includes(k));
        const asksHistory =
            q.includes("when") || q.includes("last") || q.includes("changed") ||
            q.includes("age") || q.includes("old") || wantsOwnVehicle;

        // Only intercept here if it's clearly a "when/last changed" question —
        // otherwise let the generic troubleshooting answers further down handle
        // things like "my battery is dead" or "my tyre is flat".
        const isTroubleshooting =
            q.includes("dead") || q.includes("flat") || q.includes("puncture") ||
            q.includes("not start") || q.includes("wont start") || q.includes("won't start") ||
            q.includes("grinding") || q.includes("squeal") || q.includes("soft pedal");

        if(mentionsPart && asksHistory && !isTroubleshooting){
            const vehicle = getChatVehicle();
            if(!vehicle) return noVehicleReply();

            const date = vehicle[part.field];
            if(!date){
                return `I don't have a "${part.label} last changed" date on file for **${vehicle.name}**. Add one on the My Vehicles page and I'll be able to tell you how old they are and when to expect the next change.`;
            }

            const days = window.AutoNexusSync.daysSince(date);
            const years = (days/365).toFixed(1);
            return `**${vehicle.name}'s ${part.label}** were last changed on ${window.AutoNexusSync.formatDate(date)} — about **${years} year(s) ago**.\n\n` +
                `Typical replacement interval: ${part.interval}. ` +
                (Number(years) >= 2.5
                    ? "That's getting up there — worth having a mechanic take a look."
                    : "Still comfortably within the usual range.");
        }
    }

    // Overall vehicle health / condition
    if(
        (q.includes("health") || q.includes("condition")) &&
        (q.includes("vehicle") || q.includes("car") || q.includes("bike") || wantsOwnVehicle || q === "health")
    ){
        const vehicle = getChatVehicle();
        if(!vehicle) return noVehicleReply();

        const h = window.AutoNexusSync.computeVehicleHealth(vehicle);
        return `**${vehicle.name}'s health score: ${h.overall}%**\n\n` +
            `🔧 Engine: ${h.engine}%\n` +
            `🔋 Battery: ${h.battery}%\n` +
            `🛞 Tyres: ${h.tyre}%\n` +
            `🛑 Brakes: ${h.brake}%\n\n` +
            (h.overall>=75
                ? "Overall this looks healthy — keep up with routine checks."
                : h.overall>=50
                    ? "A few areas could use attention soon — check the breakdown above."
                    : "Several areas are due for attention — I'd recommend booking a service soon.") +
            "\n\nYou can update service, tyre, brake and battery dates any time on the **My Vehicles** page.";
    }

    // "which vehicle" / "what car do I have" / vehicle summary
    if(
        wantsOwnVehicle &&
        (q.includes("what") || q.includes("which") || q.includes("tell me about") || q.includes("details") || q.includes("summary"))
    ){
        const vehicle = getChatVehicle();
        if(!vehicle) return noVehicleReply();

        const h = window.AutoNexusSync.computeVehicleHealth(vehicle);
        return `**${vehicle.name}** (${vehicle.number||"no registration on file"})\n\n` +
            `• Fuel: ${vehicle.fuel||"--"}\n` +
            `• Mileage: ${Number(vehicle.mileage||0).toLocaleString("en-IN")} km\n` +
            `• Insurance: ${vehicle.insurance ? window.AutoNexusSync.formatDate(vehicle.insurance) : "not on file"}\n` +
            `• Health score: ${h.overall}%\n\n` +
            "Ask me about its next service, insurance, or the health of a specific part any time.";
    }

    return null;
}

function generateResponse(input){
    const q = input.toLowerCase();

    // Vehicle-specific answers using the person's real saved data take
    // priority over generic troubleshooting guidance.
    const vehicleAnswer = tryVehicleDataAnswer(q);
    if(vehicleAnswer) return vehicleAnswer;

    if(
        q.includes("hello") ||

        q.includes("hi") ||
        q.includes("hey")
    ){
        return "Hello! 👋\n\nWhat can I help you with today — a vehicle problem, maintenance, mileage, repair cost, or finding a mechanic?";
    }

    if(
        q.includes("not start") ||
        q.includes("won't start") ||
        q.includes("wont start") ||
        q.includes("starting problem")
    ){
        return "**If your car is not starting**, check these first:\n\n" +
            "1. 🔋 Check whether the battery is weak — dim lights or clicking sounds can indicate a battery problem.\n" +
            "2. 🔑 Make sure the key/immobilizer is recognised.\n" +
            "3. ⛽ Check that there is enough fuel.\n" +
            "4. ⚙️ If the starter turns but the engine does not start, the issue may need professional diagnosis.\n\n" +
            "If you are stranded, you can use the **Emergency SOS** page for roadside assistance.";
    }

    if(
        q.includes("battery") ||
        q.includes("dead battery")
    ){
        return "**Battery issue checklist:**\n\n" +
            "• Check headlights and interior lights.\n" +
            "• Listen for clicking when starting.\n" +
            "• Check battery terminals for visible corrosion.\n" +
            "• If the battery is completely dead, roadside jump-start assistance may help.\n\n" +
            "Avoid repeated starting attempts if the battery is severely discharged.";
    }

    if(
        q.includes("tyre") ||
        q.includes("tire") ||
        q.includes("puncture") ||
        q.includes("flat")
    ){
        return "**For a flat or punctured tyre:**\n\n" +
            "1. Move to a safe location if possible.\n" +
            "2. Turn on hazard lights.\n" +
            "3. Do not drive far on a completely flat tyre.\n" +
            "4. Use a spare wheel/repair kit if you know how to use it safely.\n" +
            "5. Otherwise request roadside tyre assistance from AutoNexus.";
    }

    if(
        q.includes("mileage") ||
        q.includes("fuel efficiency") ||
        q.includes("petrol") ||
        q.includes("diesel")
    ){
        return "**Ways to improve mileage:**\n\n" +
            "• Maintain correct tyre pressure.\n" +
            "• Avoid unnecessary hard acceleration and braking.\n" +
            "• Keep up with scheduled engine and air-filter maintenance.\n" +
            "• Avoid carrying unnecessary weight.\n" +
            "• Use the recommended engine oil and fuel grade.\n\n" +
            "If mileage has suddenly dropped, it is worth checking tyre pressure, brakes, filters and engine-related issues.";
    }

    if(
        q.includes("service") ||
        q.includes("maintenance") ||
        q.includes("maintain")
    ){
        return "**A basic maintenance plan includes:**\n\n" +
            "🔧 Regular engine oil and filter service\n" +
            "🛞 Tyre pressure and tread inspection\n" +
            "🔋 Battery health checks\n" +
            "🛑 Brake inspection\n" +
            "💨 Air filter and AC checks\n" +
            "📄 Insurance and PUC renewal tracking\n\n" +
            "You can use the **Reminders** page to schedule these tasks.";
    }

    if(
        q.includes("cost") ||
        q.includes("price") ||
        q.includes("expensive") ||
        q.includes("estimate")
    ){
        return "**Repair cost depends on the exact problem, vehicle and parts required.**\n\n" +
            "For a rough estimate, tell me:\n" +
            "• Vehicle model and year\n" +
            "• The problem/symptoms\n" +
            "• Whether the vehicle is still driveable\n\n" +
            "For an actual quote, a mechanic should inspect the vehicle.";
    }

    if(
        q.includes("brake") ||
        q.includes("brakes")
    ){
        return "**Brake warning signs:**\n\n" +
            "• Grinding or loud squealing\n" +
            "• Vehicle pulling to one side while braking\n" +
            "• Vibrations through the steering wheel\n" +
            "• Soft or unusually low brake pedal\n" +
            "• Brake warning light\n\n" +
            "If braking performance is significantly reduced, avoid driving and request professional assistance.";
    }

    if(
        q.includes("engine") ||
        q.includes("overheat") ||
        q.includes("overheating")
    ){
        return "**If the engine is overheating:**\n\n" +
            "1. Stop somewhere safe and switch off the engine.\n" +
            "2. Do not open a hot coolant/radiator cap.\n" +
            "3. Let the engine cool down.\n" +
            "4. Check for obvious coolant leaks once it is safe.\n" +
            "5. If overheating continues, have the vehicle inspected rather than continuing to drive.";
    }

    if(
        q.includes("mechanic") ||
        q.includes("garage") ||
        q.includes("repair shop")
    ){
        return "I can help you find a mechanic. 🔧\n\n" +
            "Open the **Mechanics** page to see nearby mechanics, ratings, services, distance and booking options.\n\n" +
            "You can also tell me the problem, such as **battery**, **tyre**, **AC**, or **engine**, and I'll suggest what type of service you need.";
    }

    if(
        q.includes("reminder") ||
        q.includes("renewal") ||
        q.includes("insurance") ||
        q.includes("puc")
    ){
        return "You can manage your vehicle reminders from the **Reminders** page. 🔔\n\n" +
            "You can create reminders for service, insurance, PUC, RC, tyres, battery and other maintenance tasks.";
    }

    if(
        q.includes("document") ||
        q.includes("rc")
    ){
        return "Your vehicle documents are managed in the **Documents** section. 📁\n\n" +
            "You can keep track of important vehicle documents and their expiry dates there.";
    }

    if(
        q.includes("emergency") ||
        q.includes("sos") ||
        q.includes("stranded")
    ){
        return "If you're stranded because of a vehicle problem, open **Emergency SOS**. 🚨\n\n" +
            "You can request roadside assistance, share your location and access emergency contacts.";
    }

    if(
        q.includes(" ac ") || q.startsWith("ac ") || q.endsWith(" ac") || q==="ac" ||
        q.includes("air condition") || q.includes("cooling not") || q.includes("not cooling")
    ){
        return "**If the AC isn't cooling well:**\n\n" +
            "1. ❄️ Check the cabin air filter — a clogged filter is the most common cause.\n" +
            "2. 🌡️ Low refrigerant (gas) is common if cooling has gradually weakened over months.\n" +
            "3. 🌀 Listen for the AC compressor engaging (a faint click/hum when AC turns on).\n" +
            "4. 🍃 Make sure the condenser (front of the radiator) isn't blocked by dirt or debris.\n\n" +
            "Refrigerant top-ups and compressor issues need a mechanic — it's not usually a DIY fix.";
    }

    if(
        q.includes("noise") || q.includes("rattl") || q.includes("squeak") ||
        q.includes("clunk") || q.includes("knocking sound")
    ){
        return "**Unusual noises are worth investigating early.** A few common patterns:\n\n" +
            "• **Squealing at startup** — often a loose or worn belt.\n" +
            "• **Rattling over bumps** — usually a loose heat shield, exhaust mount, or suspension part.\n" +
            "• **Clunking when braking/turning** — often worn suspension bushes or links.\n" +
            "• **Grinding while braking** — worn brake pads, needs attention soon.\n\n" +
            "If you can describe when it happens (braking, turning, over bumps, at idle), I can narrow it down further.";
    }

    if(
        q.includes("warning light") || q.includes("dashboard light") ||
        q.includes("check engine") || q.includes("indicator light") || q.includes("light on dashboard")
    ){
        return "**Common dashboard warning lights:**\n\n" +
            "🔴 **Red lights** (oil, brake, temperature) — stop as soon as safely possible.\n" +
            "🟡 **Yellow/orange lights** (check engine, ABS, TPMS) — get it checked soon, usually still driveable short-term.\n" +
            "🔵 **Blue/green lights** — informational (high beam, indicators, etc.), no issue.\n\n" +
            "If you tell me which light (e.g. \"check engine\", \"oil\", \"battery\", \"ABS\"), I can explain what it usually means.";
    }

    if(
        q.includes("pulling") || q.includes("pulls to") || q.includes("steering") ||
        q.includes("alignment") || q.includes("vibration in steering")
    ){
        return "**If the car pulls to one side or the steering feels off:**\n\n" +
            "1. 🛞 Check tyre pressure on all four tyres — uneven pressure is a very common cause.\n" +
            "2. 📐 Wheel alignment may be off, especially after hitting a pothole or curb.\n" +
            "3. 🔧 Uneven tyre wear or a suspension issue can also cause pulling.\n" +
            "4. 🛑 If it only happens while braking, it could be a sticking brake caliper.\n\n" +
            "A wheel alignment and balancing check at a garage usually resolves this.";
    }

    if(
        q.includes("clutch") || q.includes("gear") || q.includes("gearbox") ||
        q.includes("transmission")
    ){
        return "**Clutch/gearbox warning signs:**\n\n" +
            "• Clutch pedal feels spongy, too high, or too low.\n" +
            "• Gears are hard to engage or grinding when shifting.\n" +
            "• A burning smell after driving in traffic (clutch slipping).\n" +
            "• Gear slipping out on its own while driving.\n\n" +
            "Any of these are worth getting inspected soon — clutch/gearbox repairs are best caught early.";
    }

    if(
        q.includes("wiper") || q.includes("visibility") || q.includes("windshield") ||
        q.includes("fog") || q.includes("rain driving") || q.includes("monsoon")
    ){
        return "**Wet-weather / low-visibility driving tips:**\n\n" +
            "• Replace wiper blades if they streak or skip — every 6–12 months typically.\n" +
            "• Top up windshield washer fluid before long trips.\n" +
            "• Check tyre tread depth — worn tyres lose grip fast on wet roads.\n" +
            "• Use fog lights (not high beams) in heavy fog or rain.\n" +
            "• Avoid driving through waterlogged roads if the depth is unclear — it can damage the engine.";
    }

    if(
        q.includes("smoke") || q.includes("exhaust")
    ){
        return "**Exhaust smoke color usually tells you what's wrong:**\n\n" +
            "⚪ **White smoke** (thick, persistent) — coolant may be burning; possible head gasket issue.\n" +
            "🔵 **Blue smoke** — engine oil is burning, often worn piston rings or valve seals.\n" +
            "⚫ **Black smoke** — running rich (too much fuel), often an air filter or injector issue.\n\n" +
            "A little white vapour on a cold morning is normal condensation — persistent smoke of any color is worth a mechanic's opinion.";
    }

    if(
        q.includes("jump start") || q.includes("jumpstart") || q.includes("push start")
    ){
        return "**How to jump-start a car safely:**\n\n" +
            "1. Park the donor car close but not touching, both engines off.\n" +
            "2. Connect **red (+)** to the dead battery's positive terminal, then the donor's positive.\n" +
            "3. Connect **black (–)** to the donor's negative terminal, then to an unpainted metal surface on the dead car (not the battery) — this avoids sparks near the battery.\n" +
            "4. Start the donor car, let it run a minute, then try starting the dead car.\n" +
            "5. Once started, remove cables in reverse order and let it run/drive for 15+ minutes to recharge.\n\n" +
            "If it won't hold a charge after this, the battery likely needs replacing.";
    }

    if(
        q.includes("road trip") || q.includes("long drive") || q.includes("highway") ||
        q.includes("before trip") || q.includes("long journey")
    ){
        return "**Pre-road-trip checklist:**\n\n" +
            "✅ Tyre pressure and spare wheel\n" +
            "✅ Engine oil and coolant levels\n" +
            "✅ Brake feel and pads\n" +
            "✅ Battery terminals and charge\n" +
            "✅ Wipers and washer fluid\n" +
            "✅ Lights — headlights, indicators, brake lights\n" +
            "✅ Documents — RC, insurance, PUC (check the **Documents** page)\n\n" +
            "Want me to check any of these against your saved vehicle data — like insurance expiry or last service date?";
    }

    if(
        q.includes("what can you do") || q.includes("help me") || q === "help" ||
        q.includes("who are you") || q.includes("what are you")
    ){
        return "**I'm AutoNexus AI** — here's what I can help with:\n\n" +
            "🩺 **Troubleshooting** — starting issues, brakes, AC, noises, warning lights, smoke, steering\n" +
            "🚗 **Your vehicle** — ask \"when's my next service?\", \"is my insurance due?\", \"how are my tyres?\", or \"what's my vehicle health?\" and I'll check your actual saved data\n" +
            "🛠️ **Maintenance planning** — service checklists, mileage tips, pre-trip checklists\n" +
            "💰 **Rough cost guidance** — tell me the problem and vehicle for a ballpark idea\n" +
            "📍 **Finding help** — mechanics, roadside assistance, documents, reminders\n\n" +
            "Just ask naturally — no need for exact keywords.";
    }

    if(
        q.includes("bye") || q.includes("goodbye") || q.includes("see you")
    ){
        return "Take care and drive safe! 🚗 Come back anytime you have a vehicle question.";
    }

    if(
        q.includes("thank") ||
        q.includes("thanks")
    ){
        return "You're welcome! 🚗✨\n\nLet me know if you need help with your vehicle.";
    }

    return "I can help with **troubleshooting, maintenance, mileage, repair-cost guidance, mechanics, documents, reminders and roadside assistance** — and I can check your own vehicle's saved data too.\n\n" +
        "Try asking something like:\n" +
        "• When is my next service due?\n" +
        "• Is my insurance about to expire?\n" +
        "• What's my vehicle's health score?\n" +
        "• Why is my car not starting?\n" +
        "• My AC isn't cooling — what should I check?\n" +
        "• What should I check before a long road trip?";
}

/* FORM */

chatForm.addEventListener("submit",e=>{
    e.preventDefault();
    sendMessage(chatInput.value);
});

/* SUGGESTIONS */

document.querySelectorAll(".suggestions button")
    .forEach(button=>{
        button.addEventListener("click",()=>{
            sendMessage(button.dataset.prompt);
        });
    });

/* TOOLS */

const toolPrompts = {
    diagnose:"My car has a problem. Help me diagnose it.",
    maintenance:"Create a maintenance plan for my vehicle.",
    cost:"Give me a rough estimate for a vehicle repair.",
    mileage:"Give me tips to improve my car mileage.",
    vehicle:"Give me a summary of my vehicle — service, insurance and health."
};

document.querySelectorAll(".tool-row")
    .forEach(tool=>{
        tool.addEventListener("click",()=>{
            sendMessage(toolPrompts[tool.dataset.tool]);
        });
    });

/* CLEAR / NEW CHAT */

document.getElementById("clearChat")
    .addEventListener("click",()=>{
        if(!confirm("Clear this conversation?")) return;

        messages = [];
        saveChat();
        chatMessages.innerHTML = "";

        addMessage(
            "ai",
            "Chat cleared. 👋\n\nHow can I help you with your vehicle?",
            true
        );
    });

document.getElementById("newChat")
    .addEventListener("click",()=>{
        messages = [];
        saveChat();
        chatMessages.innerHTML = "";

        addMessage(
            "ai",
            "New conversation started. 🚗\n\nWhat would you like to know about your vehicle?",
            true
        );
    });

/* VOICE INPUT */

document.getElementById("voiceBtn")
    .addEventListener("click",()=>{
        const SpeechRecognition =
            window.SpeechRecognition ||
            window.webkitSpeechRecognition;

        if(!SpeechRecognition){
            alert("Voice input is not supported in this browser.");
            return;
        }

        const recognition = new SpeechRecognition();

        recognition.lang = "en-IN";
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.start();

        document.getElementById("voiceBtn").style.color =
            "#39d6b6";

        recognition.onresult = event=>{
            chatInput.value =
                event.results[0][0].transcript;
        };

        recognition.onerror = ()=>{
            alert("Unable to capture voice input.");
        };

        recognition.onend = ()=>{
            document.getElementById("voiceBtn").style.color =
                "";
        };
    });

/* NOTIFICATION */

/* YOUR VEHICLE — dynamic, kept in sync with the Dashboard and My Vehicles
   pages via the shared "active" vehicle field. */

const VEHICLES_KEY = "autonexus_vehicles";

function getVehicles(){
    try{
        const parsed = JSON.parse(localStorage.getItem(VEHICLES_KEY));
        return Array.isArray(parsed) ? parsed : [];
    }catch{ return []; }
}

function saveVehicles(vehicles){
    localStorage.setItem(VEHICLES_KEY,JSON.stringify(vehicles));
}

function renderVehicleCard(){
    const vehicles = getVehicles();
    const select = document.getElementById("assistantVehicleSelect");
    const nameEl = document.getElementById("vehicleName");
    const numberEl = document.getElementById("vehicleNumber");
    const metaEl = document.getElementById("vehicleMeta");
    const healthLabelEl = document.getElementById("vehicleHealthLabel");
    const healthBarEl = document.getElementById("vehicleHealthBar");

    if(!vehicles.length){
        select.style.display = "none";
        select.innerHTML = "";
        nameEl.textContent = "No Vehicle Added";
        numberEl.textContent = "------";
        metaEl.textContent = "Fuel: --";
        healthLabelEl.textContent = "--";
        healthBarEl.style.width = "0%";
        return;
    }

    const active = window.AutoNexusSync.getActiveVehicle(vehicles);

    // Let the person change which vehicle the assistant is talking about.
    if(vehicles.length > 1){
        select.style.display = "";
        select.innerHTML = vehicles.map(v=>`
            <option value="${v.id}" ${String(v.id)===String(active.id) ? "selected" : ""}>
                ${escapeHTML(v.name || "Vehicle")} ${v.number ? "• "+escapeHTML(v.number) : ""}
            </option>
        `).join("");
    }else{
        select.style.display = "none";
        select.innerHTML = "";
    }

    nameEl.textContent = active.name || "Vehicle";
    numberEl.textContent = active.number || "------";
    metaEl.textContent = `Fuel: ${active.fuel || "--"}`;

    const health = window.AutoNexusSync.computeVehicleHealth(active);
    const label = health.overall>=75 ? "Good" : health.overall>=50 ? "Fair" : "Needs Attention";
    healthLabelEl.textContent = `${label} • ${health.overall}%`;
    healthBarEl.style.width = `${health.overall}%`;
}

document.getElementById("assistantVehicleSelect")
    .addEventListener("change",event=>{
        const vehicles = getVehicles();
        window.AutoNexusSync.setActiveVehicle(vehicles,event.target.value);
        saveVehicles(vehicles);
        renderVehicleCard();
    });

window.addEventListener("autonexus:data-updated",()=>{
    renderVehicleCard();
});

/* LOGOUT */

function logout(){
    localStorage.removeItem("loggedInUser");
    sessionStorage.removeItem("loggedInUser");
    window.location.href="../login.html";
}

renderVehicleCard();
initializeChat();
