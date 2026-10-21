const STORAGE_KEY="autonexus_users";
function getUsers(){try{const v=JSON.parse(localStorage.getItem(STORAGE_KEY));return Array.isArray(v)?v:[]}catch{return []}}
function saveUsers(users){localStorage.setItem(STORAGE_KEY,JSON.stringify(users))}
function getLoggedInUser(){try{return JSON.parse(localStorage.getItem("loggedInUser"))||JSON.parse(sessionStorage.getItem("loggedInUser"))||null}catch{return null}}
function validEmail(email){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
function validPassword(password){return /^[A-Za-z0-9]{8,}$/.test(password)}
function setMessage(message,error=false){let el=document.getElementById("authMessage");if(!el){el=document.createElement("div");el.id="authMessage";el.style.cssText="margin:10px 0;padding:10px 12px;border-radius:8px;font-size:13px";const form=document.getElementById("signupForm")||document.getElementById("loginForm");if(form)form.prepend(el)}el.textContent=message;el.style.background=error?"rgba(239,68,68,.12)":"rgba(200,169,106,.14)";el.style.color=error?"#ef4444":"inherit"}
document.addEventListener("click", function(event) {
    const toggle = event.target.closest(".togglePassword");
    if (!toggle) return;
    event.preventDefault();
    const input = document.getElementById(toggle.dataset.target);
    if (!input) return;
    const icon = toggle.querySelector("i");
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    toggle.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
    toggle.setAttribute("title", isHidden ? "Hide password" : "Show password");
    if (icon) icon.className = isHidden ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
});
const signupForm=document.getElementById("signupForm");
if(signupForm)signupForm.addEventListener("submit",e=>{e.preventDefault();const name=document.getElementById("name").value.trim(),phone=document.getElementById("phone").value.trim(),email=document.getElementById("email").value.trim().toLowerCase(),location=document.getElementById("location").value.trim(),gender=document.getElementById("gender").value,dob=document.getElementById("dob").value,password=document.getElementById("password").value,confirmPassword=document.getElementById("confirmPassword").value;if(!name||!phone||!email||!location||!gender||!dob){setMessage("Please complete all required fields.",true);return}if(!validEmail(email)){setMessage("Invalid email address.",true);return}if(!validPassword(password)){setMessage("Password must contain at least 8 letters/numbers.",true);return}if(password!==confirmPassword){setMessage("Passwords do not match.",true);return}const users=getUsers();if(users.some(u=>u.email.toLowerCase()===email)){setMessage("Email already registered.",true);return}const user={id:Date.now(),name,phone,email,location,city:location,gender,dob,password};users.push(user);saveUsers(users);setMessage("Account created successfully.");setTimeout(()=>window.location.href="login.html",500)});
const loginForm=document.getElementById("loginForm");
if(loginForm)loginForm.addEventListener("submit",e=>{e.preventDefault();const email=document.getElementById("loginEmail").value.trim().toLowerCase(),password=document.getElementById("loginPassword").value,remember=document.getElementById("remember").checked,user=getUsers().find(u=>u.email.toLowerCase()===email&&u.password===password);if(!user){setMessage("Invalid email or password.",true);return}const safe={...user};if(remember){localStorage.setItem("loggedInUser",JSON.stringify(safe));sessionStorage.removeItem("loggedInUser")}else{sessionStorage.setItem("loggedInUser",JSON.stringify(safe));localStorage.removeItem("loggedInUser")}setMessage("Login successful.");setTimeout(()=>window.location.href="dashboard.html",350)});
function logout(){localStorage.removeItem("loggedInUser");sessionStorage.removeItem("loggedInUser");window.location.href="login.html"}