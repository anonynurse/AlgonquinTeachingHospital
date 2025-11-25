// js/app.js
import { Auth } from "./auth.js";

let patientsData = [];                     // from patients.csv
const openPatientTabs = new Map();         // patientNumber -> tab element
const patientCharts = new Map();           // patientNumber -> full chart JSON
let currentUser = null;                    // { username, role }

const PATIENT_STORAGE_PREFIX = "adh_patient_chart_";

/* ---------- LOCAL PERSISTENCE HELPERS ---------- */

function loadChartFromLocal(patientNumber) {
  const key = PATIENT_STORAGE_PREFIX + patientNumber;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Failed to parse local chart for", patientNumber, e);
    return null;
  }
}

function saveChartToLocal(chart) {
  if (!chart || !chart.patientNumber) return;
  const key = PATIENT_STORAGE_PREFIX + chart.patientNumber;
  try {
    localStorage.setItem(key, JSON.stringify(chart));
  } catch (e) {
    console.error("Failed to save chart to localStorage", e);
  }
}

function exportChartAsJson(chart) {
  if (!chart) return;
  const filename = `${chart.patientNumber || "patient"}.json`;
  const blob = new Blob([JSON.stringify(chart, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------- BASIC UTIL ---------- */

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ---------- ENTRY POINT ---------- */

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

  if (!loginForm) return;

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (errorEl) errorEl.textContent = "";

    const username = loginForm.username.value.trim();
    const password = loginForm.password.value;

    const user = Auth.login(username, password);

    if (!user) {
      if (errorEl) errorEl.textContent = "Invalid username or password.";
      return;
    }

    loginForm.reset();
    showMainApp(user);
  });
}

function setupNav() {
  const logoutBtn = document.getElementById("logout-btn");
  const navTabs = document.querySelectorAll(".nav-tab");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      Auth.logout();
      currentUser = null;
      patientCharts.clear();
      openPatientTabs.clear();
      showLoginScreen();
      refreshBrainAssignedList();
    });
  }

  navTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      navTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      const viewName = tab.dataset.view; // "brain", "patient-list", etc.
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

  currentUser = user;

  if (loginScreen) loginScreen.classList.remove("active");
  if (mainApp) mainApp.classList.add("active");
  if (usernameDisplay) usernameDisplay.textContent = user.username;

  setActiveView("brain");
  setActiveTab("brain");
  refreshBrainAssignedList();
}

function showLoginScreen() {
  const loginScreen = document.getElementById("login-screen");
  const mainApp = document.getElementById("main-app");

  if (mainApp) mainApp.classList.remove("active");
  if (loginScreen) loginScreen.classList.add("active");
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

    // Clicking a row just opens/ensures a tab, no auto-switch
    tr.addEventListener("click", () => {
      openPatientTab(p.patientNumber);
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
        activatePatientTab(patientNumber);
      }
    });

    tabBar.appendChild(tabEl);
    openPatientTabs.set(patientNumber, tabEl);
  }

  // Do NOT activate automatically when row clicked.
}

function activatePatientTab(patientNumber) {
  for (const [id, el] of openPatientTabs.entries()) {
    if (id === patientNumber) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  }

  loadAndRenderPatientChart(patientNumber);
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
      const lastId = remaining[remaining.length - 1];
      activatePatientTab(lastId);
    } else {
      setActiveTab("patient-list");
      setActiveView("patient-list");
    }
  }
}

/* ---------- LOAD & RENDER PATIENT CHART ---------- */

async function loadAndRenderPatientChart(patientNumber) {
  const summaryRow = patientsData.find(
    (p) => p.patientNumber === patientNumber
  );

  // 1) Try overridden chart from localStorage
  let chart = loadChartFromLocal(patientNumber);

  // 2) If none, fetch base JSON or fallback to CSV
  if (!chart) {
    try {
      const res = await fetch(`data/patients/${patientNumber}.json`);
      if (res.ok) {
        chart = await res.json();
      } else {
        console.warn(
          `No JSON chart found for patient ${patientNumber}, using CSV only.`
        );
        chart = buildFallbackChartFromCsv(summaryRow);
      }
    } catch (err) {
      console.error("Error loading patient chart JSON", err);
      chart = buildFallbackChartFromCsv(summaryRow);
    }
  }

  if (!chart.assignedNurses) chart.assignedNurses = [];
  if (!chart.medications) chart.medications = { activeOrders: [], mar: [] };

  patientCharts.set(patientNumber, chart);

  renderPatientDetail(chart);
  setActiveView("patient-detail");
  refreshBrainAssignedList();
}

function buildFallbackChartFromCsv(row) {
  if (!row) return null;
  return {
    patientNumber: row.patientNumber,
    demographics: {
      firstName: row.firstName,
      lastName: row.lastName,
      gender: row.gender,
      dateOfBirth: row.dob,
      age: Number(row.age),
      weightKg: Number(row.weight),
      allergies: row.allergies,
      unit: "",
      room: ""
    },
    diagnoses: [],
    orders: [],
    vitalsLog: [],
    assessments: [],
    medications: { activeOrders: [], mar: [] },
    assignedNurses: []
  };
}

/* ---------- ASSIGN / UNASSIGN LOGIC ---------- */

function toggleAssignment(patientNumber) {
  if (!currentUser) return;

  const chart = patientCharts.get(patientNumber);
  if (!chart) return;

  if (!Array.isArray(chart.assignedNurses)) {
    chart.assignedNurses = [];
  }

  const uname = currentUser.username;
  const idx = chart.assignedNurses.indexOf(uname);

  if (idx === -1) {
    chart.assignedNurses.push(uname);
  } else {
    chart.assignedNurses.splice(idx, 1);
  }

  saveChartToLocal(chart);
  renderPatientDetail(chart);
  refreshBrainAssignedList();
}

/* ---------- BRAIN: MY ASSIGNED PATIENTS ---------- */

function refreshBrainAssignedList() {
  const container = document.getElementById("brain-assigned-list");
  if (!container) return;

  if (!currentUser) {
    container.innerHTML = `<p class="muted">Not logged in.</p>`;
    return;
  }

  const assigned = [];

  for (const chart of patientCharts.values()) {
    if (
      Array.isArray(chart.assignedNurses) &&
      chart.assignedNurses.includes(currentUser.username)
    ) {
      assigned.push(chart);
    }
  }

  if (assigned.length === 0) {
    container.innerHTML = `<p class="muted">You are not currently assigned to any patients.</p>`;
    return;
  }

  const rows = assigned
    .map((chart) => {
      const d = chart.demographics || {};
      const name = `${(d.lastName || "").toUpperCase()}, ${d.firstName || ""}`;
      const unit = d.unit || "";
      const room = d.room || "";
      return `
        <tr data-patient-number="${chart.patientNumber}">
          <td>${chart.patientNumber}</td>
          <td>${name}</td>
          <td>${unit}</td>
          <td>${room}</td>
        </tr>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="patient-table">
        <thead>
          <tr>
            <th>Patient #</th>
            <th>Name</th>
            <th>Unit</th>
            <th>Room</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll("tbody tr").forEach((tr) => {
    const pn = tr.dataset.patientNumber;
    tr.addEventListener("click", () => {
      if (!pn) return;
      openPatientTab(pn);
      activatePatientTab(pn);
    });
  });
}

/* ---------- PATIENT DETAIL RENDERING (ADMIN EDIT + EXPORT) ---------- */

function renderPatientDetail(chart) {
  if (!chart) return;

  const container = document.getElementById("patient-detail-content");
  if (!container) return;

  const d = chart.demographics || {};
  const diagnoses = chart.diagnoses || [];
  const primaryDx = diagnoses.length ? diagnoses[0].description : "N/A";

  const isAssigned =
    currentUser &&
    Array.isArray(chart.assignedNurses) &&
    chart.assignedNurses.includes(currentUser.username);

  const isAdmin = currentUser && currentUser.role === "admin";

  container.innerHTML = `
    <section class="patient-banner">
      <div class="patient-banner-main">
        <div class="patient-name">
          ${escapeHtml(d.lastName || "").toUpperCase()}, ${escapeHtml(d.firstName || "")}
        </div>
        <div class="patient-meta">
          <span>Patient # ${chart.patientNumber || ""}</span>
          ${d.gender ? `<span>Gender: ${escapeHtml(d.gender)}</span>` : ""}
          ${d.unit ? `<span>Unit: ${escapeHtml(d.unit)}</span>` : ""}
          ${d.room ? `<span>Room: ${escapeHtml(d.room)}</span>` : ""}
        </div>
      </div>
      ${
        currentUser
          ? `<button id="assign-btn" class="btn-secondary btn-assign">
               ${isAssigned ? "Unassign Me" : "Assign Me"}
             </button>`
          : ""
      }
    </section>

    <section class="patient-info-grid">
      <div class="info-item">
        <div class="info-label">First Name</div>
        <div class="info-value">
          ${
            isAdmin
              ? `<input id="edit-first-name" value="${escapeHtml(d.firstName || "")}">`
              : escapeHtml(d.firstName || "")
          }
        </div>
      </div>

      <div class="info-item">
        <div class="info-label">Last Name</div>
        <div class="info-value">
          ${
            isAdmin
              ? `<input id="edit-last-name" value="${escapeHtml(d.lastName || "")}">`
              : escapeHtml(d.lastName || "")
          }
        </div>
      </div>

      <div class="info-item">
        <div class="info-label">Date of Birth</div>
        <div class="info-value">
          ${
            isAdmin
              ? `<input id="edit-dob" value="${escapeHtml(d.dateOfBirth || "")}">`
              : escapeHtml(d.dateOfBirth || "")
          }
        </div>
      </div>

      <div class="info-item">
        <div class="info-label">Age</div>
        <div class="info-value">
          ${
            isAdmin
              ? `<input id="edit-age" type="number" value="${d.age ?? ""}">`
              : (d.age ?? "")
          }
        </div>
      </div>

      <div class="info-item">
        <div class="info-label">Weight (kg)</div>
        <div class="info-value">
          ${
            isAdmin
              ? `<input id="edit-weight" type="number" step="0.1" value="${d.weightKg ?? ""}">`
              : (d.weightKg != null ? d.weightKg + " kg" : "")
          }
        </div>
      </div>

      <div class="info-item">
        <div class="info-label">Allergies</div>
        <div class="info-value">
          ${
            isAdmin
              ? `<input id="edit-allergies" value="${escapeHtml(
                  d.allergies || "No Known Allergies"
                )}">`
              : escapeHtml(d.allergies || "No Known Allergies")
          }
        </div>
      </div>

      <div class="info-item">
        <div class="info-label">Unit</div>
        <div class="info-value">
          ${
            isAdmin
              ? `<input id="edit-unit" value="${escapeHtml(d.unit || "")}">`
              : escapeHtml(d.unit || "")
          }
        </div>
      </div>

      <div class="info-item">
        <div class="info-label">Room</div>
        <div class="info-value">
          ${
            isAdmin
              ? `<input id="edit-room" value="${escapeHtml(d.room || "")}">`
              : escapeHtml(d.room || "")
          }
        </div>
      </div>

      <div class="info-item">
        <div class="info-label">Primary Diagnosis</div>
        <div class="info-value">
          ${
            isAdmin
              ? `<input id="edit-primary-dx" value="${escapeHtml(primaryDx || "")}">`
              : escapeHtml(primaryDx)
          }
        </div>
      </div>

      <div class="info-item">
        <div class="info-label">Active Orders</div>
        <div class="info-value">${(chart.orders || []).length}</div>
      </div>

      <div class="info-item">
        <div class="info-label">MAR Entries</div>
        <div class="info-value">${(chart.medications?.mar || []).length}</div>
      </div>
    </section>

    ${
      isAdmin
        ? `<div class="info-item" style="margin-top:0.5rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
             <button id="save-patient-btn" class="btn-primary" style="width:auto;padding-inline:1.25rem;">
               Save Changes
             </button>
             <button id="export-patient-btn" class="btn-secondary" style="width:auto;padding-inline:1.25rem;">
               Export JSON
             </button>
           </div>`
        : ""
    }
  `;

  // Assign button
  const assignBtn = document.getElementById("assign-btn");
  if (assignBtn && currentUser) {
    assignBtn.addEventListener("click", () => {
      toggleAssignment(chart.patientNumber);
    });
  }

  if (isAdmin) {
    const saveBtn = document.getElementById("save-patient-btn");
    const exportBtn = document.getElementById("export-patient-btn");

    const applyAdminEdits = () => {
      const d2 = chart.demographics || {};
      const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : "";
      };

      d2.firstName = getVal("edit-first-name");
      d2.lastName = getVal("edit-last-name");
      d2.dateOfBirth = getVal("edit-dob");

      const ageVal = getVal("edit-age");
      d2.age = ageVal ? Number(ageVal) : null;

      const weightVal = getVal("edit-weight");
      d2.weightKg = weightVal ? Number(weightVal) : null;

      d2.allergies = getVal("edit-allergies") || "No Known Allergies";
      d2.unit = getVal("edit-unit");
      d2.room = getVal("edit-room");
      chart.demographics = d2;

      const newPrimaryDx = getVal("edit-primary-dx");
      if (!chart.diagnoses) chart.diagnoses = [];
      if (chart.diagnoses.length === 0 && newPrimaryDx) {
        chart.diagnoses.push({
          code: "",
          description: newPrimaryDx,
          type: "Medical",
          status: "Active",
          onset: ""
        });
      } else if (chart.diagnoses.length > 0) {
        chart.diagnoses[0].description = newPrimaryDx;
      }
    };

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        applyAdminEdits();
        saveChartToLocal(chart);
        patientCharts.set(chart.patientNumber, chart);
        renderPatientDetail(chart);
        refreshBrainAssignedList();
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        applyAdminEdits();
        saveChartToLocal(chart);
        patientCharts.set(chart.patientNumber, chart);
        exportChartAsJson(chart);
      });
    }
  }
}
