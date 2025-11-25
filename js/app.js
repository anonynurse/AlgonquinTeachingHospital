// js/app.js
import { Auth } from "./auth.js";

let patientsData = [];
const openPatientTabs = new Map(); // patientNumber -> tab element

document.addEventListener("DOMContentLoaded", () => {
  Auth.init();
  setupLogin();
  setupNav();
  loadPatients();
  restoreSessionIfExists();
});

/* ---------- LOGIN & NAV ---------- */

function setupLogin() {
  const loginForm = document.getElementById("login-form");
  const errorEl = document.getElementById("login-error");

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    errorEl.textContent = "";

    const username = loginForm.username.value.trim();
    const password = loginForm.password.value;

    const user = Auth.login(username, password);

    if (!user) {
      errorEl.textContent = "Invalid username or password.";
      return;
    }

    loginForm.reset();
    showMainApp(user);
  });
}

function setupNav() {
  const logoutBtn = document.getElementById("logout-btn");
  const navTabs = document.querySelectorAll(".nav-tab");

  logoutBtn.addEventListener("click", () => {
    Auth.logout();
    showLoginScreen();
  });

  navTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      // Activate primary nav tab
      navTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      const viewName = tab.dataset.view; // e.g. "brain" or "patient-list" etc.
      setActiveView(viewName);
    });
  });
}

function restoreSessionIfExists() {
  const user = Auth.getCurrentUser();
  if (user) {
    showMainApp(user);
  } else {
    showLoginScreen();
  }
}

function showMainApp(user) {
  const loginScreen = document.getElementById("login-screen");
  const mainApp = document.getElementById("main-app");
  const usernameDisplay = document.getElementById("nav-username");

  loginScreen.classList.remove("active");
  mainApp.classList.add("active");

  usernameDisplay.textContent = user.username;

  // Default view
  setActiveView("brain");
  setActiveTab("brain");
}

function showLoginScreen() {
  const loginScreen = document.getElementById("login-screen");
  const mainApp = document.getElementById("main-app");

  mainApp.classList.remove("active");
  loginScreen.classList.add("active");
}

/* ---------- VIEW HELPERS ---------- */

function setActiveView(viewName) {
  const views = document.querySelectorAll(".view");
  views.forEach((v) => v.classList.remove("active"));

  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add("active");
}

function setActiveTab(viewName) {
  const tabs = document.querySelectorAll(".nav-tab");
  tabs.forEach((t) => {
    if (t.dataset.view === viewName) {
      t.classList.add("active");
    } else {
      t.classList.remove("active");
    }
  });
}

/* ---------- PATIENT LIST: LOAD & RENDER ---------- */

async function loadPatients() {
  try {
    const res = await fetch("data/patients.csv");
    if (!res.ok) {
      console.error("Failed to load patients.csv", res.status);
      return;
    }

    const text = await res.text();
    patientsData = parsePatientsCsv(text);
    renderPatientList();
  } catch (err) {
    console.error("Error loading patients.csv", err);
  }
}

function parsePatientsCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const dataLines = lines.slice(1); // skip header

  return dataLines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      return {
        patientNumber: cols[0],
        lastName: cols[1],
        firstName: cols[2],
        gender: cols[3],
        dob: cols[4],
        age: cols[5],
        weight: cols[6],
        allergies: cols[7] ?? ""
      };
    });
}

function renderPatientList() {
  const tbody = document.getElementById("patient-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  patientsData.forEach((p) => {
    const tr = document.createElement("tr");
    tr.dataset.patientNumber = p.patientNumber;

    tr.innerHTML = `
      <td>${p.patientNumber}</td>
      <td>${p.lastName}</td>
      <td>${p.firstName}</td>
      <td>${p.gender}</td>
      <td>${p.dob}</td>
      <td>${p.age}</td>
      <td>${p.weight}</td>
      <td>${p.allergies}</td>
    `;

    // NEW BEHAVIOUR: just create/open tab, don't switch view
    tr.addEventListener("click", () => {
      openPatientTab(p.patientNumber); // ensures tab exists, no activate
    });

    tbody.appendChild(tr);
  });
}

/* ---------- PATIENT TABS (SECOND ROW) ---------- */

function openPatientTab(patientNumber) {
  const patient = patientsData.find(
    (p) => p.patientNumber === patientNumber
  );
  if (!patient) return;

  const tabBar = document.getElementById("patient-tab-bar");
  if (!tabBar) return;

  // Create tab if not already open
  if (!openPatientTabs.has(patientNumber)) {
    const tabEl = document.createElement("button");
    tabEl.className = "patient-tab";
    tabEl.dataset.patientNumber = patientNumber;
    tabEl.innerHTML = `
      <span class="patient-tab-label">${patient.lastName}, ${patient.firstName}</span>
      <span class="tab-close" aria-label="Close tab">&times;</span>
    `;

    tabEl.addEventListener("click", (e) => {
      const target = e.target;
      if (target.classList.contains("tab-close")) {
        e.stopPropagation();
        closePatientTab(patientNumber);
      } else {
        // Clicking the tab itself activates the chart
        activatePatientTab(patientNumber);
      }
    });

    tabBar.appendChild(tabEl);
    openPatientTabs.set(patientNumber, tabEl);
  }

  // IMPORTANT CHANGE:
  // We NO LONGER call activatePatientTab(patientNumber) here.
  // So clicking a patient row just opens/ensures the tab exists,
  // but does not switch the active view.
}

function activatePatientTab(patientNumber) {
  const patient = patientsData.find(
    (p) => p.patientNumber === patientNumber
  );
  if (!patient) return;

  // Highlight active patient tab
  for (const [id, el] of openPatientTabs.entries()) {
    if (id === patientNumber) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  }

  // Render patient detail and switch to its view
  renderPatientDetail(patient);
  setActiveView("patient-detail");
}

function closePatientTab(patientNumber) {
  const tabEl = openPatientTabs.get(patientNumber);
  if (!tabEl) return;

  const isActive = tabEl.classList.contains("active");
  tabEl.remove();
  openPatientTabs.delete(patientNumber);

  if (isActive) {
    const remaining = Array.from(openPatientTabs.keys());
    if (remaining.length > 0) {
      // Activate the last remaining tab
      const lastId = remaining[remaining.length - 1];
      activatePatientTab(lastId);
    } else {
      // No patient tabs left: go back to patient list
      setActiveTab("patient-list");
      setActiveView("patient-list");
    }
  }
}

/* ---------- PATIENT DETAIL RENDERING ---------- */

function renderPatientDetail(patient) {
  const container = document.getElementById("patient-detail-content");
  if (!container) return;

  container.innerHTML = `
    <section class="patient-banner">
      <div class="patient-name">${patient.lastName.toUpperCase()}, ${patient.firstName}</div>
      <div class="patient-meta">
        <span>Patient # ${patient.patientNumber}</span>
        <span>Gender: ${patient.gender}</span>
      </div>
    </section>

    <section class="patient-info-grid">
      <div class="info-item">
        <div class="info-label">Date of Birth</div>
        <div class="info-value">${patient.dob}</div>
      </div>

      <div class="info-item">
        <div class="info-label">Age</div>
        <div class="info-value">${patient.age}</div>
      </div>

      <div class="info-item">
        <div class="info-label">Weight</div>
        <div class="info-value">${patient.weight} kg</div>
      </div>

      <div class="info-item">
        <div class="info-label">Allergies</div>
        <div class="info-value">${patient.allergies}</div>
      </div>
    </section>
  `;
}
