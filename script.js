// ===== PAGE LOADER =====
window.addEventListener("load", () => {
  const loader = document.getElementById("pageLoader");
  if (loader) {
    // Natural loading based on actual page load
    setTimeout(() => {
      loader.classList.add("hidden");
    }, 300);
  }
});

// ===== HAMBURGER MENU =====
const hamburger = document.getElementById("hamburger");
const navMenu = document.querySelector(".nav-menu");
const mobileOverlay = document.getElementById("mobileOverlay");

function toggleMenu() {
  hamburger.classList.toggle("active");
  navMenu.classList.toggle("active");
  mobileOverlay.classList.toggle("active");
  document.body.style.overflow =
    hamburger.classList.contains("active") ? "hidden" : "";
}

function closeMenu() {
  hamburger.classList.remove("active");
  navMenu.classList.remove("active");
  mobileOverlay.classList.remove("active");
  document.body.style.overflow = "";
}

if (hamburger) hamburger.addEventListener("click", toggleMenu);
if (mobileOverlay) mobileOverlay.addEventListener("click", closeMenu);

// Close menu when clicking nav links
document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    closeMenu();
  });
});

// ===== ACTIVE NAV ON SCROLL =====
let lastScrollTop = 0;
const header = document.querySelector("header");
const scrollThreshold = 100;

// Set active nav link based on current page
const currentPage = window.location.pathname.split("/").pop() || "index.html";
document.querySelectorAll(".nav-link").forEach((link) => {
  const linkPage = link.getAttribute("href");
  if (
    linkPage === currentPage ||
    (currentPage === "" && linkPage === "index.html")
  ) {
    link.classList.add("active");
  } else {
    link.classList.remove("active");
  }
});

window.addEventListener("scroll", () => {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

  // Hide/Show navbar based on scroll direction
  if (scrollTop > scrollThreshold) {
    if (scrollTop > lastScrollTop) {
      // Scrolling down - hide navbar
      header.classList.add("nav-hidden");
      header.classList.remove("nav-visible");
    } else {
      // Scrolling up - show navbar
      header.classList.remove("nav-hidden");
      header.classList.add("nav-visible");
    }
  } else {
    // At top of page - always show
    header.classList.remove("nav-hidden");
    header.classList.remove("nav-visible");
  }

  lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
});

// ===== HERO PET CAROUSEL =====
let heroPetIndex = 0;
const heroPets = document.querySelectorAll(".hero-pet");

function showHeroPet(index) {
  heroPets.forEach((pet) => pet.classList.remove("active"));
  heroPets[index].classList.add("active");
}

function nextHeroPet() {
  heroPetIndex = (heroPetIndex + 1) % heroPets.length;
  showHeroPet(heroPetIndex);
}

// Auto-advance every 5 seconds
setInterval(nextHeroPet, 5000);

// Hero Sign Up Button
document.getElementById("heroSignupBtn")?.addEventListener("click", () => {
  openModal();
  showForm(document.getElementById("signupForm"));
});

document.getElementById("heroLoginBtn")?.addEventListener("click", () => {
  openModal();
  showForm(document.getElementById("loginForm"));
});

// ===== ABOUT BACKGROUND SLIDESHOW =====
let bgIndex = 0;
const bgSlides = document.querySelectorAll(".bg-slide");

function nextBgSlide() {
  if (bgSlides.length === 0) return;
  bgSlides[bgIndex].classList.remove("active");
  bgIndex = (bgIndex + 1) % bgSlides.length;
  bgSlides[bgIndex].classList.add("active");
}

setInterval(nextBgSlide, 5000);

// ===== SCROLL BUTTONS =====
document.querySelectorAll(".scroll-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.getAttribute("data-target");
    const container = document.getElementById(`${target}-scroll`);
    const direction = btn.classList.contains("scroll-prev") ? -1 : 1;

    if (container) {
      container.scrollBy({
        left: direction * container.clientWidth * 0.8,
        behavior: "smooth",
      });
    }
  });
});

// ===== TEAM CAROUSEL NAVIGATION =====
document.querySelectorAll(".carousel-nav").forEach((btn) => {
  btn.addEventListener("click", () => {
    const carouselType = btn.getAttribute("data-carousel");
    const direction = btn.classList.contains("prev") ? -1 : 1;
    const container = document.getElementById(`${carouselType}-carousel`);

    if (container) {
      const cardWidth = container.querySelector(".team-card").offsetWidth;
      const gap = 24; // 1.5rem gap
      container.scrollBy({
        left: direction * (cardWidth + gap),
        behavior: "smooth",
      });
    }
  });
});

// ===== MODAL =====
const modal = document.getElementById("modal");
const openBtns = [].filter((btn) => btn !== null); // legacy - kept for compatibility
const closeBtn = document.getElementById("closeModal");

// Modal screens and forms
const guestForm = document.getElementById("guestForm");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

function openModal() {
  modal.classList.add("active");
  document.body.style.overflow = "hidden";

  // Default: show signup form
  if (guestForm) guestForm.classList.add("hidden");
  if (loginForm) loginForm.classList.add("hidden");
  if (signupForm) signupForm.classList.remove("hidden");

  // Set minimum date to today for all date inputs

  const today = new Date().toISOString().split("T")[0];
  document.getElementById("signupDob").max = today;
}

function closeModal() {
  modal.classList.remove("active");
  document.body.style.overflow = "";
}

function resetModal() {
  if (guestForm) {
    guestForm.classList.add("hidden");
    guestForm.reset();
  }
  if (loginForm) {
    loginForm.classList.add("hidden");
    loginForm.reset();
  }
  if (signupForm) {
    signupForm.classList.remove("hidden");
    signupForm.reset();
  }
}

function showForm(formElement) {
  if (guestForm) guestForm.classList.add("hidden");
  if (loginForm) loginForm.classList.add("hidden");
  if (signupForm) signupForm.classList.add("hidden");
  if (formElement) formElement.classList.remove("hidden");
}

// Open modal buttons (legacy)
openBtns.forEach((btn) => {
  if (btn) btn.addEventListener("click", openModal);
});

// Navbar buttons
document.getElementById("navSignupBtn")?.addEventListener("click", () => {
  openModal();
  showForm(document.getElementById("signupForm"));
});
document.getElementById("navLoginBtn")?.addEventListener("click", () => {
  openModal();
  showForm(document.getElementById("loginForm"));
});

// CTA section buttons (index.html)
document.getElementById("ctaSignupBtn")?.addEventListener("click", () => {
  openModal();
  showForm(document.getElementById("signupForm"));
});
document.getElementById("ctaLoginBtn")?.addEventListener("click", () => {
  openModal();
  showForm(document.getElementById("loginForm"));
});

// Services CTA buttons
document.getElementById("servicesSignupBtn")?.addEventListener("click", () => {
  openModal();
  showForm(document.getElementById("signupForm"));
});
document.getElementById("servicesLoginBtn")?.addEventListener("click", () => {
  openModal();
  showForm(document.getElementById("loginForm"));
});

// Close modal
if (closeBtn) closeBtn.addEventListener("click", closeModal);

// Only close when BOTH mousedown and mouseup land on the backdrop itself.
// This prevents accidental closes when the user drags text and releases outside the form.
let _modalMousedownOnBackdrop = false;
modal.addEventListener("mousedown", (e) => {
  _modalMousedownOnBackdrop = e.target === modal;
});
modal.addEventListener("click", (e) => {
  if (e.target === modal && _modalMousedownOnBackdrop) closeModal();
  _modalMousedownOnBackdrop = false;
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal.classList.contains("active")) closeModal();
});

// Option buttons - show respective forms
document.querySelectorAll(".switch-form").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const targetBtn = link.getAttribute("data-target");
    if (targetBtn === "loginBtn") {
      showForm(loginForm);
    } else if (targetBtn === "signupBtn") {
      showForm(signupForm);
    }
  });
});

// ===== FORM VALIDATIONS =====

// Guest Form Submission
if (guestForm) {
  guestForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const phone = document.getElementById("guestPhone")?.value;
    const agreeTerms = document.getElementById("guestAgreeTerms")?.checked;

    if (phone && !/^[0-9]{11}$/.test(phone)) {
      showAlert(
        "Please enter a valid 11-digit phone number (e.g., 09XXXXXXXXX)",
        "error",
        "Invalid Phone Number",
      );
      return;
    }
    if (!agreeTerms) {
      showAlert(
        "You must agree to the Terms and Conditions and Privacy Policy",
        "warning",
        "Agreement Required",
      );
      return;
    }

    const data = {
      ownerName: document.getElementById("guestName")?.value,
      email: document.getElementById("guestEmail")?.value,
      phone,
      petName: document.getElementById("guestPetName")?.value,
      petSpecies: document.getElementById("guestPetSpecies")?.value,
      service: document.getElementById("guestService")?.value,
      date: document.getElementById("guestDate")?.value,
      time: document.getElementById("guestTime")?.value,
      notes: document.getElementById("guestNotes")?.value,
    };

    // Guest booking — replace with real fetch when backend is ready
    showAlert(
      "Appointment booked! We will send you a confirmation shortly.",
      "success",
      "Booking Submitted",
    );
    closeModal();
    guestForm.reset();
  });
}

// LOGIN HANDLER
const loginForm = document.getElementById("loginForm");

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(loginForm);

    try {
      const response = await fetch('/_backend/login.php', {
        method: 'POST',
        body: formData
      });

      // Parse JSON
      const result = await response.json();

      if (result.success) {
        window.location.href = '/dashboard.php';
      } else {
        showAlert(result.message, "error", "Login Failed");
      }
    } catch (error) {
      console.error("Login error:", error);
      showAlert("Could not connect to the server. Please check your network.", "error", "Connection Error");
    }
  });
}// LOGIN HANDLER
const loginForm = document.getElementById("loginForm");

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(loginForm);

    try {
      const response = await fetch('/_backend/login.php', {
        method: 'POST',
        body: formData
      });

      // Parse JSON
      const result = await response.json();

      if (result.success) {
        window.location.href = '/dashboard.php';
      } else {
        showAlert(result.message, "error", "Login Failed");
      }
    } catch (error) {
      console.error("Login error:", error);
      showAlert("Could not connect to the server. Please check your network.", "error", "Connection Error");
    }
  });
}

// SIGNUP HANDLER — Updated for Live Backend
if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // 1. Client-side validation (keep your existing checks)
    const password = document.getElementById("signupPassword")?.value;
    const confirmPassword = document.getElementById("signupConfirmPassword")?.value;

    if (!password || password.length < 8) {
      showAlert("Password must be at least 8 characters long.", "error", "Weak Password");
      return;
    }
    // ... (keep your regex checks here)
    if (password !== confirmPassword) {
      showAlert("Passwords do not match.", "error", "Password Mismatch");
      return;
    }

    // 2. Send to PHP Backend
    const formData = new FormData(signupForm);

    try {
      const response = await fetch('/_backend/index.php', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();

      if (result.success) {
        showAlert("Account created successfully! Redirecting...", "success", "Success");
        setTimeout(() => window.location.href = '/_backend/login.php', 2000);
      } else {
        showAlert(result.message, "error", "Registration Failed");
      }
    } catch (error) {
      console.error("Registration error:", error);
      showAlert("Could not connect to the registration server.", "error", "Connection Error");
    }
  });
}

// ===== SIGNUP FIELD RESTRICTIONS =====
(function () {
  // Block digits from name fields — fires before the character appears
  ["signupLastName", "signupFirstName", "signupMiddleName"].forEach(
    function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("keydown", function (e) {
        if (e.key >= "0" && e.key <= "9") e.preventDefault();
      });
      // Also strip any digits that sneak in via paste / autofill
      el.addEventListener("input", function () {
        var pos = el.selectionStart;
        var cleaned = el.value.replace(/[0-9]/g, "");
        if (cleaned !== el.value) {
          el.value = cleaned;
          el.setSelectionRange(pos - 1, pos - 1);
        }
      });
    },
  );

  // Block non-digits from phone field
  var phoneEl = document.getElementById("signupPhone");
  if (phoneEl) {
    phoneEl.addEventListener("keydown", function (e) {
      var allowed = [
        "Backspace",
        "Delete",
        "ArrowLeft",
        "ArrowRight",
        "Tab",
        "Home",
        "End",
      ];
      if (allowed.includes(e.key)) return;
      if (e.key < "0" || e.key > "9") e.preventDefault();
    });
    phoneEl.addEventListener("input", function () {
      var cleaned = phoneEl.value.replace(/[^0-9]/g, "").slice(0, 11);
      if (cleaned !== phoneEl.value) phoneEl.value = cleaned;
    });
  }
})();

const termsPopup = document.getElementById("termsPopup");

function openTermsPopup() {
  if (termsPopup) termsPopup.classList.add("active");
}

function closeTermsPopup() {
  if (termsPopup) termsPopup.classList.remove("active");
}

// Open on terms-link click
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("terms-link")) {
    e.preventDefault();
    openTermsPopup();
  }
});

// Close buttons
document.querySelectorAll(".terms-popup-close").forEach((btn) => {
  btn.addEventListener("click", closeTermsPopup);
});

// Close on backdrop click
if (termsPopup) {
  termsPopup.addEventListener("click", (e) => {
    if (e.target === termsPopup) closeTermsPopup();
  });
}

// ===== SMOOTH SCROLL =====
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    const href = this.getAttribute("href");
    if (href !== "#") {
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }
  });
});

// ===== SCROLL ANIMATIONS =====
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("fade-in-up");
      }
    });
  },
  {
    threshold: 0.15,
    rootMargin: "0px 0px -50px 0px",
  },
);

// Observe cards
document.querySelectorAll(".card").forEach((el) => observer.observe(el));

// ===== ENHANCED SCROLL ANIMATIONS =====
const scrollObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("animate-in");
      }
    });
  },
  {
    threshold: 0.1,
    rootMargin: "0px 0px -80px 0px",
  },
);

// Observe all animatable elements
document.addEventListener("DOMContentLoaded", () => {
  // Service cards
  document
    .querySelectorAll(".service-card, .service-card-detailed")
    .forEach((el) => {
      el.classList.add("scroll-animate");
      scrollObserver.observe(el);
    });

  // Team cards
  document.querySelectorAll(".team-card").forEach((el) => {
    el.classList.add("scroll-animate");
    scrollObserver.observe(el);
  });

  // About cards
  document.querySelectorAll(".about-cards .card").forEach((el) => {
    el.classList.add("scroll-animate");
    scrollObserver.observe(el);
  });

  // Stats
  document.querySelectorAll(".stat").forEach((el) => {
    el.classList.add("scroll-animate");
    scrollObserver.observe(el);
  });

  // Hero stats
  document.querySelectorAll(".hero-stats .stat").forEach((el) => {
    el.classList.add("scroll-animate-delay");
    scrollObserver.observe(el);
  });

  // Section titles
  document.querySelectorAll(".section h2, .page-hero h1").forEach((el) => {
    el.classList.add("scroll-animate-title");
    scrollObserver.observe(el);
  });

  // Subtitles
  document.querySelectorAll(".subtitle, .page-hero p").forEach((el) => {
    el.classList.add("scroll-animate-subtitle");
    scrollObserver.observe(el);
  });

  // Contact items
  document.querySelectorAll(".contact-item").forEach((el) => {
    el.classList.add("scroll-animate");
    scrollObserver.observe(el);
  });

  // Location details
  const locationDetails = document.querySelector(".location-details");
  if (locationDetails) {
    locationDetails.classList.add("scroll-animate");
    scrollObserver.observe(locationDetails);
  }

  // Story content
  const storyText = document.querySelector(".story-text");
  const storyImage = document.querySelector(".story-image");
  if (storyText) {
    storyText.classList.add("scroll-animate-left");
    scrollObserver.observe(storyText);
  }
  if (storyImage) {
    storyImage.classList.add("scroll-animate-right");
    scrollObserver.observe(storyImage);
  }
});

console.log("🐾 VHS Animal Wellness Center - Ready!");

// ===== CONTACT FORM =====
const contactForm = document.getElementById("contactForm");
if (contactForm) {
  contactForm.addEventListener("submit", (e) => {
    e.preventDefault();
    alert("Thank you for your message! We will get back to you soon.");
    contactForm.reset();
  });
}

// ===== REGISTRATION FORM VALIDATION =====
// (handled by the signupForm AJAX handler above)

// ===== AI CHATBOT FUNCTIONALITY =====
// This is a placeholder structure for future AI integration
const chatbotBubble = document.getElementById("chatbotBubble");
const chatbotWindow = document.getElementById("chatbotWindow");
const chatbotClose = document.getElementById("chatbotClose");
const chatbotInput = document.getElementById("chatbotInput");
const chatbotSend = document.getElementById("chatbotSend");
const chatbotMessages = document.getElementById("chatbotMessages");

// Toggle chatbot window
function toggleChatbot() {
  chatbotBubble.classList.toggle("active");
  chatbotWindow.classList.toggle("active");
}

if (chatbotBubble) {
  chatbotBubble.addEventListener("click", toggleChatbot);
}

if (chatbotClose) {
  chatbotClose.addEventListener("click", toggleChatbot);
}

// Send message function (placeholder for AI integration)
function sendMessage() {
  const message = chatbotInput.value.trim();
  if (!message) return;

  // Add user message
  addMessage(message, "user");
  chatbotInput.value = "";

  // Simulate bot response (replace with actual AI integration)
  setTimeout(() => {
    addTypingIndicator();
    setTimeout(() => {
      removeTypingIndicator();
      addMessage(
        "Thank you for your message! This is a placeholder response. AI integration coming soon.",
        "bot",
      );
    }, 1500);
  }, 500);
}

// Add message to chat
function addMessage(text, sender) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `chatbot-message ${sender}-message`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
  </svg>`;

  const content = document.createElement("div");
  content.className = "message-content";
  content.innerHTML = `<p>${text}</p>`;

  messageDiv.appendChild(avatar);
  messageDiv.appendChild(content);
  chatbotMessages.appendChild(messageDiv);

  // Scroll to bottom
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}

// Add typing indicator
function addTypingIndicator() {
  const typingDiv = document.createElement("div");
  typingDiv.className = "chatbot-message bot-message typing-indicator-message";
  typingDiv.innerHTML = `
    <div class="message-avatar">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
      </svg>
    </div>
    <div class="message-content typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  chatbotMessages.appendChild(typingDiv);
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}

// Remove typing indicator
function removeTypingIndicator() {
  const typingIndicator = chatbotMessages.querySelector(
    ".typing-indicator-message",
  );
  if (typingIndicator) {
    typingIndicator.remove();
  }
}

// Send button click
if (chatbotSend) {
  chatbotSend.addEventListener("click", sendMessage);
}

// Enter key to send
if (chatbotInput) {
  chatbotInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  });
}

// ===== INTERACTIVE BUBBLE POP EFFECT =====
const floatingBadges = document.querySelectorAll(".floating-badge");

floatingBadges.forEach((badge) => {
  let isPopped = false;
  let reappearTimeout = null;

  badge.addEventListener("click", function () {
    // Prevent multiple clicks while animating
    if (isPopped) return;

    isPopped = true;

    // Add popping animation
    badge.classList.add("popping");

    // After pop animation completes, hide the badge
    setTimeout(() => {
      badge.classList.remove("popping");
      badge.classList.add("hidden");

      // Reappear after 10 seconds
      reappearTimeout = setTimeout(() => {
        badge.classList.remove("hidden");
        badge.classList.add("reappearing");

        // Remove reappearing class after animation
        setTimeout(() => {
          badge.classList.remove("reappearing");
          isPopped = false;
        }, 800);
      }, 10000); // 10 seconds
    }, 600); // Duration of pop animation
  });

  // Cleanup on page unload
  window.addEventListener("beforeunload", () => {
    if (reappearTimeout) {
      clearTimeout(reappearTimeout);
    }
  });
});
