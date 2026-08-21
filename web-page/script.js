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

// ===== PAW SVG =====
const _PAW_SVG = '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><ellipse cx="22" cy="18" rx="8" ry="10"/><ellipse cx="42" cy="18" rx="8" ry="10"/><ellipse cx="10" cy="34" rx="7" ry="9"/><ellipse cx="54" cy="34" rx="7" ry="9"/><path d="M32 36c-10 0-18 7-18 14s4 10 10 10c4 0 6-2 8-6 2 4 4 6 8 6 6 0 10-5 10-10s-8-14-18-14z"/></svg>';
const _PAW_TRAIL = '<div class="loader-paws"><div class="loader-paw">' + _PAW_SVG + '</div><div class="loader-paw">' + _PAW_SVG + '</div><div class="loader-paw">' + _PAW_SVG + '</div><div class="loader-paw">' + _PAW_SVG + '</div></div>';

// ===== HAMBURGER MENU =====
const hamburger = document.getElementById("hamburger");
const navMenu = document.querySelector(".nav-menu");
const mobileOverlay = document.getElementById("mobileOverlay");

function toggleMenu() {
  if (!hamburger || !navMenu || !mobileOverlay) return;
  hamburger.classList.toggle("active");
  navMenu.classList.toggle("active");
  mobileOverlay.classList.toggle("active");
  document.body.style.overflow =
    hamburger.classList.contains("active") ? "hidden" : "";
}

function closeMenu() {
  if (!hamburger || !navMenu || !mobileOverlay) return;
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

if (header) {
  window.addEventListener("scroll", () => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    if (scrollTop > scrollThreshold) {
      if (scrollTop > lastScrollTop) {
        header.classList.add("nav-hidden");
        header.classList.remove("nav-visible");
      } else {
        header.classList.remove("nav-hidden");
        header.classList.add("nav-visible");
      }
    } else {
      header.classList.remove("nav-hidden");
      header.classList.remove("nav-visible");
    }

    lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
  });
}

// ===== HERO PET CAROUSEL =====
let heroPetIndex = 0;
const heroPets = document.querySelectorAll(".hero-pet");

function nextHeroPet() {
  if (heroPets.length === 0) return;
  heroPets[heroPetIndex].classList.remove("active");
  heroPetIndex = (heroPetIndex + 1) % heroPets.length;
  heroPets[heroPetIndex].classList.add("active");
}

if (heroPets.length > 0) setInterval(nextHeroPet, 5000);

// ===== ANIMATED COUNTER STATS =====
(function initCounters() {
  const counters = document.querySelectorAll('.stat-number[data-count]');
  const textCounters = document.querySelectorAll('.stat-number[data-text]');
  let counted = false;

  function animateCounter(el) {
    const target = parseInt(el.dataset.count, 10);
    const suffix = el.dataset.suffix || '';
    const duration = 1500;
    const start = performance.now();

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  function animateTextCounter(el) {
    const text = el.dataset.text;
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => {
      el.textContent = text;
      el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, 1200);
  }

  function startCounters() {
    if (counted) return;
    counted = true;
    counters.forEach(animateCounter);
    textCounters.forEach(animateTextCounter);
  }

  // Start after loader hides
  setTimeout(startCounters, 800);
})();

// ===== HERO HIGHLIGHT ICON SCROLL ANIMATION =====
(function initHighlightAnim() {
  const highlights = document.querySelectorAll('.hero-highlight');
  if (!highlights.length) return;

  let animated = false;
  function checkInView() {
    if (animated) return;
    const rect = highlights[0].getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      animated = true;
      highlights.forEach(h => h.classList.add('in-view'));
    }
  }

  // Check on load and scroll
  setTimeout(checkInView, 600);
  window.addEventListener('scroll', checkInView, { once: true });
})();

// Hero Sign Up Button
document.getElementById("heroSignupBtn")?.addEventListener("click", () => {
  openBookModal();
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

if (bgSlides.length > 0) setInterval(nextBgSlide, 5000);

// ===== STORY IMAGE CAROUSEL =====
(function initStoryCarousel() {
  const track = document.getElementById("storyTrack");
  const slides = track ? track.querySelectorAll(".story-slide") : [];
  const dots = document.querySelectorAll(".story-dots .dot");
  if (!track || !slides.length) return;

  const INTERVAL = 4000;
  let current = 0;
  let timer = null;

  function showSlide(index) {
    current = (index + slides.length) % slides.length;
    track.style.transform = "translateX(-" + current * 100 + "%)";
    dots.forEach((d, i) => d.classList.toggle("active", i === current));
    restartTimer();
  }

  function nextSlide() { showSlide(current + 1); }

  function restartTimer() {
    if (timer) clearInterval(timer);
    timer = setInterval(nextSlide, INTERVAL);
  }

  dots.forEach((dot) => {
    dot.addEventListener("click", () => showSlide(parseInt(dot.dataset.slide, 10)));
  });

  const carousel = document.getElementById("storyCarousel");
  if (carousel) {
    carousel.addEventListener("mouseenter", () => { if (timer) clearInterval(timer); });
    carousel.addEventListener("mouseleave", restartTimer);
  }

  restartTimer();
})();

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
const closeBtn = document.getElementById("closeModal");

// Modal screens and forms
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

function openModal() {
  if (!modal) return;
  modal.classList.add("active");
  document.body.style.overflow = "hidden";

  // Default: show signup form
  if (loginForm) loginForm.classList.add("hidden");
  if (signupForm) signupForm.classList.remove("hidden");

  // Set minimum date to today for all date inputs

  const today = new Date().toISOString().split("T")[0];
  const signupDob = document.getElementById("signupDob");
  if (signupDob) signupDob.max = today;
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove("active");
  document.body.style.overflow = "";
}

function showForm(formElement) {
  if (loginForm) loginForm.classList.add("hidden");
  if (signupForm) signupForm.classList.add("hidden");
  if (formElement) formElement.classList.remove("hidden");
}

[
  ["navSignupBtn", signupForm],
  ["ctaSignupBtn", signupForm],
  ["servicesSignupBtn", signupForm],
  ["heroSignupBtn", signupForm],
  ["navLoginBtn", loginForm],
  ["ctaLoginBtn", loginForm],
  ["servicesLoginBtn", loginForm],
  ["heroLoginBtn", loginForm],
].forEach(([id, form]) => {
  document.getElementById(id)?.addEventListener("click", () => {
    openModal();
    showForm(form);
  });
});

// Close modal
if (closeBtn) closeBtn.addEventListener("click", closeModal);

// Only close when BOTH mousedown and mouseup land on the backdrop itself.
// This prevents accidental closes when the user drags text and releases outside the form.
let _modalMousedownOnBackdrop = false;
if (modal) {
  modal.addEventListener("mousedown", (e) => {
    _modalMousedownOnBackdrop = e.target === modal;
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal && _modalMousedownOnBackdrop) closeModal();
    _modalMousedownOnBackdrop = false;
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (serviceModal?.classList.contains("active")) closeServiceModal();
  else if (modal?.classList.contains("active")) closeModal();
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

// ===== SERVICE DETAIL MODAL (services page) =====
const serviceModal = document.getElementById("serviceModal");
const serviceModalClose = document.getElementById("closeServiceModal");
const serviceModalTitle = document.getElementById("serviceModalTitle");
const serviceModalCategory = document.getElementById("serviceModalCategory");
const serviceModalIcon = document.getElementById("serviceModalIcon");
const serviceModalBody = document.getElementById("serviceModalBody");
const serviceBookBtn = document.getElementById("serviceBookBtn");

function openServiceModal(card) {
  if (!serviceModal) return;
  const titleEl = card.querySelector(".service-header h4");
  const descEl = card.querySelector(".service-description");
  const iconEl = card.querySelector(".service-icon svg");
  const categoryEl = card.closest(".service-category")?.querySelector(".category-title");

  if (serviceModalTitle) serviceModalTitle.textContent = titleEl ? titleEl.textContent.trim() : "Service";
  if (serviceModalBody) serviceModalBody.textContent = descEl ? descEl.textContent.trim() : "";
  if (serviceModalIcon && iconEl) {
    serviceModalIcon.innerHTML = "";
    serviceModalIcon.appendChild(iconEl.cloneNode(true));
  }
  if (serviceModalCategory && categoryEl) {
    // category-title contains an icon span + text; keep only the label text
    const clone = categoryEl.cloneNode(true);
    clone.querySelector(".category-icon")?.remove();
    serviceModalCategory.textContent = clone.textContent.trim();
  }
  serviceModal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeServiceModal() {
  if (!serviceModal) return;
  serviceModal.classList.remove("active");
  document.body.style.overflow = "";
}

document.querySelectorAll(".btn-service").forEach((btn) => {
  btn.addEventListener("click", () => {
    const card = btn.closest(".service-card-detailed");
    if (card) openServiceModal(card);
  });
});

if (serviceModalClose) serviceModalClose.addEventListener("click", closeServiceModal);

// Backdrop click (mousedown+mouseup on backdrop) and Escape close
let _svcMousedownOnBackdrop = false;
if (serviceModal) {
  serviceModal.addEventListener("mousedown", (e) => {
    _svcMousedownOnBackdrop = e.target === serviceModal;
  });
  serviceModal.addEventListener("click", (e) => {
    if (e.target === serviceModal && _svcMousedownOnBackdrop) closeServiceModal();
    _svcMousedownOnBackdrop = false;
  });
}

// Book Appointment → close service modal, open login modal
if (serviceBookBtn) {
  serviceBookBtn.addEventListener("click", () => {
    closeServiceModal();
    openModal();
    showForm(loginForm);
  });
}

// ===== FORM VALIDATIONS =====

// Inside script.js (replaces the fetch block starting at Source 36)
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail")?.value.trim();
    const password = document.getElementById("loginPassword")?.value;

    const formData = new FormData();
    formData.append("email2", email);
    formData.append("password1", password);

    const submitBtn = loginForm.querySelector('[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Logging in...";
    }

    try {
      // FIX: Use the correct path relative to your directory structure.
      // If the script is in web-page/ and the php file is in php_files/, use ../php_files/login.php
      const response = await fetch("login.php", {
        method: "POST",
        body: formData,
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (data && data.status === "email_not_verified") {
        _showEmailNotVerifiedAlert(data.email);
      } else if (data && data.status === "otp_required") {
        _showLoginOtpStep(data.phone, data.dev_otp, data.phone_verified);
      } else if (data && data.status === "Login successful") {
        _completeLogin(data);
      } else {
        const msg = data ? data.status : text;
        showAlert(msg, "error", "Login Failed");
      }
    } catch (error) {
      console.error("Connection error:", error);
      showAlert(
        "Could not connect to the server. Please check the path to login.php.",
        "error",
        "Connection Error",
      );
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Log In";
      }
    }
  });
}

// ── Email not verified notice ─────────────────────────────────────────────────

function _showEmailNotVerifiedAlert(email) {
  const overlay = document.createElement("div");
  overlay.className = "vhs-modal-overlay";
  overlay.style.zIndex = "99999";
  overlay.innerHTML = `
    <div class="vhs-modal" role="dialog" aria-modal="true" style="max-width:400px;">
      <div class="vhs-modal-accent error"></div>
      <div class="vhs-modal-body">
        <div class="vhs-modal-icon-wrap">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        </div>
        <div class="vhs-modal-title">Email Not Verified</div>
        <div class="vhs-modal-message">
          Your account hasn't been verified yet.<br><br>
          Please check your inbox at <strong>${email}</strong> and click the verification link we sent during registration.
        </div>
      </div>
      <div class="vhs-modal-footer">
        <button class="vhs-btn vhs-btn-primary" id="_verifyOk" style="max-width:none;flex:1;">OK, I'll check my email</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));
  overlay.querySelector("#_verifyOk").addEventListener("click", () => {
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 300);
  });
}

// ── SMS OTP step (first-time phone verify OR recurring 2FA) ───────────────────

function _showLoginOtpStep(maskedPhone, devOtp, phoneVerified) {
  const isFirstTime = !phoneVerified || parseInt(phoneVerified) === 0;
  const title = isFirstTime ? "Phone Verification" : "SMS Verification";
  const subtitle =
    isFirstTime ?
      `Complete your account setup by verifying your phone number.<br>A 6-digit code was sent to <strong>${maskedPhone}</strong>.`
    : `A 6-digit code was sent to <strong>${maskedPhone}</strong>.<br>Enter it below to complete login.`;
  const btnLabel = isFirstTime ? "Verify & Complete Setup" : "Verify & Login";

  const overlay = document.createElement("div");
  overlay.id = "_loginOtpOverlay";
  overlay.className = "vhs-modal-overlay";
  overlay.style.zIndex = "99999";
  overlay.innerHTML = `
    <div class="vhs-modal" role="dialog" aria-modal="true" style="max-width:380px;">
      <div class="vhs-modal-accent prompt"></div>
      <div class="vhs-modal-body">
        <div class="vhs-modal-icon-wrap">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
        </div>
        <div class="vhs-modal-title">${title}</div>
        <div class="vhs-modal-message">${subtitle}</div>
        <input id="_loginOtpInput" class="vhs-modal-input" type="text" inputmode="numeric"
               maxlength="6" placeholder="Enter 6-digit code" autocomplete="one-time-code"
               style="text-align:center;font-size:1.4rem;letter-spacing:0.3em;font-weight:700;margin-top:1rem;" />
        <p id="_loginOtpError" style="color:#ef4444;font-size:0.8rem;margin:0.5rem 0 0;display:none;text-align:center;"></p>
      </div>
      <div class="vhs-modal-footer" style="flex-direction:column;gap:0.5rem;">
        <button class="vhs-btn vhs-btn-primary" id="_loginOtpSubmit" style="max-width:none;width:100%;">${btnLabel}</button>
        <button class="vhs-btn vhs-btn-ghost"   id="_loginOtpCancel" style="max-width:none;width:100%;">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));

  // Dev mode: auto-fill OTP
  if (devOtp) {
    const inp = overlay.querySelector("#_loginOtpInput");
    if (inp) inp.value = devOtp;
    console.log("[Dev Mode] Login OTP:", devOtp);
  }

  // Digits only
  overlay
    .querySelector("#_loginOtpInput")
    .addEventListener("input", function () {
      this.value = this.value.replace(/[^0-9]/g, "").slice(0, 6);
    });
  // Enter key submits
  overlay
    .querySelector("#_loginOtpInput")
    .addEventListener("keydown", function (e) {
      if (e.key === "Enter") overlay.querySelector("#_loginOtpSubmit").click();
    });

  overlay.querySelector("#_loginOtpCancel").addEventListener("click", () => {
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 300);
  });

  overlay
    .querySelector("#_loginOtpSubmit")
    .addEventListener("click", async () => {
      const code = overlay.querySelector("#_loginOtpInput").value.trim();
      const errEl = overlay.querySelector("#_loginOtpError");
      if (!/^[0-9]{6}$/.test(code)) {
        errEl.textContent = "Please enter the 6-digit code.";
        errEl.style.display = "";
        return;
      }
      errEl.style.display = "none";

      const btn = overlay.querySelector("#_loginOtpSubmit");
      btn.disabled = true;
      btn.textContent = "Verifying...";

      const fd = new FormData();
      fd.append("login_otp", code);

      try {
        const res = await fetch("login.php", { method: "POST", body: fd });
        const data = await res.json();

        if (data && data.status === "Login successful") {
          overlay.classList.remove("show");
          setTimeout(() => overlay.remove(), 300);
          _completeLogin(data);
        } else {
          errEl.textContent = data ? data.status : "Verification failed.";
          errEl.style.display = "";
          btn.disabled = false;
          btn.textContent = btnLabel;
        }
      } catch {
        errEl.textContent = "Connection error. Please try again.";
        errEl.style.display = "";
        btn.disabled = false;
        btn.textContent = btnLabel;
      }
    });
}

function _completeLogin(data) {
  sessionStorage.setItem(
    "user",
    JSON.stringify({
      id: data.id,
      firstName: data.first_name,
      lastName: data.last_name,
      middleName: data.middle_name,
      email: data.email,
      phone: data.phone,
      address: data.address,
      role: data.role,
      phoneVerified: data.phone_verified || 0,
    }),
  );
  sessionStorage.setItem(
    "vhs_user",
    JSON.stringify({
      id: data.id,
      fullName: data.first_name + " " + data.last_name,
      email: data.email,
      role: data.role,
    }),
  );

  const loader = document.createElement("div");
  loader.className = "page-loader";
  loader.innerHTML =
    '<div class="loader-content">' + _PAW_TRAIL + '<div class="loader-text">Logging in</div><div class="loader-subtext">VHS</div></div>';
  document.body.appendChild(loader);

  setTimeout(() => {
    if (data.role === "admin") window.location.href = "../admin/index.html";
    else if (data.role === "clerk")
      window.location.href = "../clerk/index.html";
    else window.location.href = "../user/index.html";
  }, 1000);
}

// SIGNUP HANDLER (AJAX version)
let otpTimerInterval = null;

function syncSignupPhone() {
  const localPhoneInput = document.getElementById("signupPhoneLocal");
  const phoneInput = document.getElementById("signupPhone");
  if (!localPhoneInput || !phoneInput) return "";
  const localNumber = localPhoneInput.value.replace(/[^0-9]/g, "").slice(0, 10);
  localPhoneInput.value = localNumber;
  phoneInput.value = localNumber ? `+63${localNumber}` : "";
  return phoneInput.value;
}

async function triggerOtpSend() {
  const phone = syncSignupPhone();

  if (!/^\+639[0-9]{9}$/.test(phone)) {
    showAlert(
      "Please enter a valid Philippine phone number (e.g., +63 9XXXXXXXXX) first.",
      "warning",
      "Phone Number Required",
    );
    // Revert choice to email
    const emailRadio = document.querySelector(
      'input[name="verificationMethod"][value="email"]',
    );
    if (emailRadio) {
      emailRadio.checked = true;
      const container = document.getElementById("otpVerificationContainer");
      if (container) container.classList.add("hidden");
      const submitBtn = signupForm.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.textContent = "Send Verification Link";
    }
    return;
  }

  const resendBtn = document.getElementById("resendOtpBtn");
  if (resendBtn) resendBtn.disabled = true;

  const timerSpan = document.getElementById("otpTimer");
  let secondsLeft = 30;
  if (timerSpan) timerSpan.textContent = secondsLeft;

  clearInterval(otpTimerInterval);
  otpTimerInterval = setInterval(() => {
    secondsLeft--;
    if (timerSpan) timerSpan.textContent = secondsLeft;
    if (secondsLeft <= 0) {
      clearInterval(otpTimerInterval);
      if (resendBtn) {
        resendBtn.disabled = false;
        resendBtn.textContent = "Resend Code";
      }
    } else {
      if (resendBtn) resendBtn.textContent = `Resend in ${secondsLeft}s`;
    }
  }, 1000);

  const formData = new FormData();
  formData.append("phone2", phone);

  try {
    const otpUrl = "../php_files/sms_otp.php";

    const response = await fetch(otpUrl, {
      method: "POST",
      body: formData,
    });

    // Catch explicit server routing errors (like 404 Not Found or 500 Server Error)
    if (!response.ok) {
      throw new Error(`Server returned HTTP Status Code ${response.status}`);
    }

    const data = await response.json();

    if (data && data.status === "success") {
      if (data.dev_otp) {
        // SMS disabled (bypass mode) — auto-fill and show a clean info message
        const otpInput = document.getElementById("signupOtp");
        if (otpInput) otpInput.value = data.dev_otp;

        const isBypass = data.note && data.note.includes("bypass");
        if (isBypass) {
          showAlert(
            "SMS is temporarily unavailable. Your code has been filled in automatically — just click Verify & Create Account to continue.",
            "info",
            "SMS Bypassed",
          );
        } else {
          showAlert(
            `Verification code sent to ${phone}! Check your SMS.`,
            "success",
            "Code Sent",
          );
        }
        console.log(`[Dev] OTP code: ${data.dev_otp}`);
      } else {
        showAlert(
          "OTP verification code sent successfully via SMS!",
          "success",
          "Code Sent",
        );
      }
    } else {
      const errMsg =
        data && data.message ?
          data.message
        : "Unknown backend logic rejection.";
      showAlert(
        "Failed to send verification code: " + errMsg,
        "error",
        "Error Sending OTP",
      );
    }
  } catch (err) {
    // Log the exact internal parsing error to your browser console to pinpoint the line number
    console.error("OTP Server Routing Diagnostic:", err);
    showAlert(
      "Error reaching the OTP server. Please verify your connection or XAMPP folder structure.",
      "error",
      "Connection Error",
    );
  }
}

if (signupForm) {
  // Initialize Resend button to "Send OTP"
  const resendBtn = document.getElementById("resendOtpBtn");
  if (resendBtn) {
    resendBtn.disabled = false;
    resendBtn.textContent = "Send OTP";
    resendBtn.addEventListener("click", () => {
      triggerOtpSend();
    });
  }

  // Listen for verification method changes
  const verificationRadios = signupForm.querySelectorAll(
    'input[name="verificationMethod"]',
  );
  verificationRadios.forEach((radio) => {
    radio.addEventListener("change", (e) => {
      const value = e.target.value;
      const otpContainer = document.getElementById("otpVerificationContainer");
      const submitBtn = signupForm.querySelector('[type="submit"]');

      if (value === "sms") {
        if (otpContainer) otpContainer.classList.remove("hidden");
        if (submitBtn) submitBtn.textContent = "Verify & Create Account";
        // Trigger automatic send if phone number is entered and valid
        const phoneVal = syncSignupPhone();
        if (/^\+639[0-9]{9}$/.test(phoneVal)) {
          triggerOtpSend();
        } else {
          showAlert(
            "Please enter a valid Philippine phone number in +63 9XXXXXXXXX format, then select SMS OTP or click Send OTP.",
            "warning",
            "Phone Number Required",
          );
        }
      } else {
        if (otpContainer) otpContainer.classList.add("hidden");
        if (submitBtn) submitBtn.textContent = "Send Verification Link";
      }
    });
  });

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Password strength validation
    const password = document.getElementById("signupPassword")?.value;
    const confirmPassword = document.getElementById(
      "signupConfirmPassword",
    )?.value;

    if (!password || password.length < 8) {
      showAlert(
        "Password must be at least 8 characters long.",
        "error",
        "Weak Password",
      );
      return;
    }
    if (!/\d/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      showAlert(
        "Password must include at least 1 number and 1 special character.",
        "error",
        "Weak Password",
      );
      return;
    }
    if (password !== confirmPassword) {
      showAlert("Passwords do not match.", "error", "Password Mismatch");
      return;
    }

    // OTP validation if SMS is chosen
    const verificationMethod = signupForm.querySelector(
      'input[name="verificationMethod"]:checked',
    )?.value;
    if (verificationMethod === "sms") {
      const otpCode = document.getElementById("signupOtp")?.value.trim();
      if (!/^[0-9]{6}$/.test(otpCode || "")) {
        showAlert(
          "Please enter the 6-digit SMS verification code.",
          "warning",
          "OTP Required",
        );
        return;
      }
    }

    const signupPhone = syncSignupPhone();
    if (!/^\+639[0-9]{9}$/.test(signupPhone)) {
      showAlert(
        "Please enter a valid Philippine phone number in +63 9XXXXXXXXX format.",
        "warning",
        "Phone Number Required",
      );
      return;
    }

    const submitBtn = signupForm.querySelector('[type="submit"]');

    // Prevent double-submission
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = "Processing...";

    const formData = new FormData(signupForm);

    try {
      const registerUrl = "index.php";

      const response = await fetch(registerUrl, {
        method: "POST",
        body: formData,
      });

      // CHANGED HERE: Parse the response payload as a JSON object
      const data = await response.json();

      // CHANGED HERE: Access the payload status via data.status
      if (
        data &&
        (data.status === "Success" || data.status === "Success_SMS")
      ) {
        // Reset form immediately so no duplicate data lingers
        signupForm.reset();

        let modalTitle = "Account Created";
        let modalMsg =
          "Registration successful! Please check your inbox and click the verification link to activate your account. Once verified, you can log in — your phone number will be verified on first login.";

        if (data.status === "Success_SMS") {
          modalTitle = "Account Created & Verified";
          modalMsg =
            "Registration and SMS verification successful! Your account is fully activated. You can log in now.";
        }

        // Show themed success modal above everything
        const overlay = document.createElement("div");
        overlay.className = "vhs-modal-overlay";
        overlay.style.zIndex = "99999";
        overlay.innerHTML = `
          <div class="vhs-modal" role="dialog" aria-modal="true">
            <div class="vhs-modal-accent success"></div>
            <div class="vhs-modal-body">
              <div class="vhs-modal-icon-wrap">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <div class="vhs-modal-title">${modalTitle}</div>
              <div class="vhs-modal-message">${modalMsg}</div>
            </div>
            <div class="vhs-modal-footer">
              <button class="vhs-btn vhs-btn-primary" id="_regOk">OK</button>
            </div>
          </div>`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add("show"));
        overlay.querySelector("#_regOk").addEventListener("click", () => {
          overlay.classList.remove("show");
          setTimeout(() => overlay.remove(), 300);
          showForm(loginForm);
        });
      } else {
        // CHANGED HERE: Extract error string sent back by PHP data array
        const errMsg =
          data ? data.status : "Unknown registration response structure.";
        showAlert(
          "Registration failed: " + errMsg,
          "error",
          "Registration Failed",
        );
      }
    } catch (error) {
      console.error("Fetch response error details:", error);
      showAlert("Error submitting registration.", "error", "Connection Error");
    } finally {
      // Re-enable button whether success or failure
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
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

  var otpEl = document.getElementById("signupOtp");
  if (otpEl) {
    otpEl.addEventListener("input", function () {
      var cleaned = otpEl.value.replace(/[^0-9]/g, "").slice(0, 6);
      if (cleaned !== otpEl.value) otpEl.value = cleaned;
    });
  }

  // Format Philippine phone field
  var phoneEl = document.getElementById("signupPhoneLocal");
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
      if (e.ctrlKey || e.metaKey) return;
      if (e.key < "0" || e.key > "9") e.preventDefault();
    });
    phoneEl.addEventListener("input", function () {
      var cleaned = phoneEl.value.replace(/[^0-9]/g, "").slice(0, 10);
      if (cleaned !== phoneEl.value) phoneEl.value = cleaned;
      syncSignupPhone();
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

// ── Services page: category observer with staggered card reveal ──
const svcCatObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const cat = entry.target;
        cat.classList.add("is-visible");
        // Stagger cards inside this category
        const cards = cat.querySelectorAll(".svc-card");
        cards.forEach((card, i) => {
          card.style.transitionDelay = (i * 0.1) + "s";
          // Trigger reflow so the delay is applied from opacity 0
          void card.offsetHeight;
          card.classList.add("is-visible");
        });
        svcCatObserver.unobserve(cat);
      }
    });
  },
  {
    threshold: 0.15,
    rootMargin: "0px 0px -60px 0px",
  },
);

document.addEventListener("DOMContentLoaded", () => {
  // ── Services page: observe categories ──
  document.querySelectorAll(".svc-category").forEach((cat) => {
    svcCatObserver.observe(cat);
  });

  // ── Services page: observe CTA ──
  document.querySelectorAll(".cta").forEach((el) => {
    svcCatObserver.observe(el);
  });

  // Legacy service cards (if any old markup exists)
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
  const storyCarousel = document.querySelector(".story-carousel");
  if (storyText) {
    storyText.classList.add("scroll-animate-left");
    scrollObserver.observe(storyText);
  }
  if (storyCarousel) {
    storyCarousel.classList.add("scroll-animate-right");
    scrollObserver.observe(storyCarousel);
  }
});

console.log("VHS Animal Wellness Center - Ready!");

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


