/*=============================
        PRELOADER
=============================*/
window.addEventListener("load", () => {
    const loader = document.getElementById("loader");
    loader.style.opacity = "0";
    setTimeout(() => {
        loader.style.display = "none";
    }, 500);
});
/*=============================
      STICKY NAVBAR
=============================*/
const navbar = document.querySelector(".navbar");
window.addEventListener("scroll", () => {
    if (window.scrollY > 80) {
        navbar.classList.add("scrolled");
    }
    else {
        navbar.classList.remove("scrolled");
    }
});
/*=============================
      ANIMATED COUNTERS
=============================*/
const counters = document.querySelectorAll(".counter");
const speed = 150;
const counterObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const counter = entry.target;
            const target = +counter.dataset.target;
            let count = 0;
            const updateCounter = () => {
                const increment = target / speed;
                count += increment;
                if (count < target) {
                    counter.innerText = Math.ceil(count);
                    requestAnimationFrame(updateCounter);
                }
                else {
                    counter.innerText = target.toLocaleString() + "+";
                }
            };
            updateCounter();
            counterObserver.unobserve(counter);
        }
    });
}, {
    threshold: 0.5
});
counters.forEach(counter => {
    counterObserver.observe(counter);
});
/*=============================
      SCROLL ANIMATION
=============================*/
const hiddenElements = document.querySelectorAll(
    ".feature-card,.service-card,.locker-card,.stat-card,.mechanic-card"
);
const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add("show");
        }
    });
}, {
    threshold: 0.2
});
hiddenElements.forEach(el => {
    observer.observe(el);
});
/*=============================
      FAQ ACCORDION
=============================*/
const faqItems = document.querySelectorAll(".faq-item");
faqItems.forEach(item => {
    item.querySelector(".faq-question").addEventListener("click", () => {
        item.classList.toggle("active");
    });
});
/*=============================
      SCROLL TO TOP
=============================*/
const topBtn = document.getElementById("topBtn");
window.addEventListener("scroll", () => {
    if (window.scrollY > 400) {
        topBtn.style.display = "block";
    }
    else {
        topBtn.style.display = "none";
    }
});
topBtn.onclick = () => {
    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
};
/*=============================
      SMOOTH SCROLL
=============================*/
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute("href")).scrollIntoView({
            behavior: "smooth"
        });
    });
});
/*=============================
      MOBILE MENU
=============================*/
const menuBtn = document.querySelector(".menu-btn");
const navLinks = document.querySelector(".nav-links");
menuBtn.addEventListener("click", () => {
    navLinks.classList.toggle("active");
});
/*=============================
      ACTIVE NAVIGATION
=============================*/
const sections = document.querySelectorAll("section");
const navItems = document.querySelectorAll(".nav-links a");
window.addEventListener("scroll", () => {
    let current = "";
    sections.forEach(section => {
        const sectionTop = section.offsetTop - 120;
        if (scrollY >= sectionTop) {
            current = section.getAttribute("id");
        }
    });
    navItems.forEach(link => {
        link.classList.remove("active");
        if (link.getAttribute("href") === "#" + current) {
            link.classList.add("active");
        }
    });
});
/*=============================
      BUTTON RIPPLE EFFECT
=============================*/
const buttons = document.querySelectorAll("button");
buttons.forEach(button => {
    button.addEventListener("click", function (e) {
        const ripple = document.createElement("span");
        ripple.classList.add("ripple");
        const rect = this.getBoundingClientRect();
        ripple.style.left = e.clientX - rect.left + "px";
        ripple.style.top = e.clientY - rect.top + "px";
        this.appendChild(ripple);
        setTimeout(() => {
            ripple.remove();
        }, 600);
    });
});
/*=============================
      CONTACT FORM
=============================*/
const form = document.querySelector("form");
if (form) {
    form.addEventListener("submit", function (e) {
        e.preventDefault();
        alert("✅ Thank you! Your message has been sent.");
        form.reset();
    });
}
/*=============================
      PARALLAX HERO
=============================*/
window.addEventListener("scroll", () => {
    const hero = document.querySelector(".hero");
    hero.style.backgroundPositionY = window.pageYOffset * 0.5 + "px";
});
/*=============================
      HERO IMAGE FLOAT
=============================*/
// const heroImage = document.querySelector(".hero-right img");
// let angle = 0;
// setInterval(() => {
//     angle += 0.02;
//     heroImage.style.transform =
//         `translateY(${Math.sin(angle) * 10}px)`;
// }, 30);
/*=============================
      TYPING EFFECT
=============================*/
const heading = document.querySelector(".hero h1");
if (heading) {
    const text = heading.innerHTML.replace(/<br>/g, "\n");
    heading.innerHTML = "";
    let i = 0;
    function type() {
        if (i < text.length) {
            if (text.charAt(i) === "\n") {
                heading.innerHTML += "<br>";
            } else {
                heading.innerHTML += text.charAt(i);
            }
            i++;
            setTimeout(type, 35);
        }
    }
    type();
}