// js/app.js

/************ SIMPLE AUTH ************/

const USERS = {
  admin:  { password: "password", role: "admin" },
  sn001:  { password: "password", role: "student" },
  sn002:  { password: "password", role: "student" },
  sn003:  { password: "password", role: "student" },
  sn004:  { password: "password", role: "student" }
};

let currentUser = null;               // { username, role }
let patientsData = [];                // from patients.csv
const patientCharts = new Map();      // patientNumber -> chart JSON
const openPatientTabs = new Map();    // patientNumber -> tab element

// Drug manual state
let drugsList = [];                   // from data/drugs/drugs.json
const drugDetails = new Map();        // id -> drug JSON
const openDrugTabs = new Map();       // id -> tab element

/************ UTIL ************/

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

/************ ENTRY ************/

document.addEventListener("DOMContentLoaded", () => {
  setupLogin();
  setupNav();
  loadPatients();
  loadDrugs();
  restoreSessionIfExists();
});

/************ AUTH + NAV ************/

function tryLogin(username, password) {
  const userRec = USERS[username];
  if (!userRec) return null;
  if (userRec.password !== password) return null;
  return { username, role: userRec.role };
}

function saveSession(user) {
  try {
    window.sessionStorage.setItem("adh_user", JSON.stringify(user));
  } catch (e) {
    console.warn("Could not save session:", e);
  }
}

function getSessionUser() {
  try {
    const raw = window.sessionStorage.getItem("adh_user");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function clearSession() {
  try {
    window.sessionStorage.removeItem("adh_user");
  } catch (e) {
    /* ignore */
  }
}

function setupLogin() {
  const loginForm = document.getElementById("login-form");
  const errorEl = document.getElementById("login-error");
  if (!loginForm) return;

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (errorEl) errorEl.textContent = "";

    const username = loginForm.username.value.trim();
    const password = loginForm.password.value;

    const user = tryLogin(username, password);

    if (!user) {
      if (errorEl) errorEl.textContent = "Invalid username or password.";
      return;
    }

    currentUser = user;
    saveSession(user);
    loginForm.reset();
    showMainApp(user);
  });
}

function setupNav() {
  const logoutBtn = document.getElementById("logout-btn");
  const navTabs = document.querySelectorAll(".nav-tab");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      clearSession();
      currentUser = null;

      // Clear in-memory state
      patientCharts.clear();
      openPatientTabs.clear();
      openDrugTabs.clear();

      // Clear patient tab bar
      const ptTabBar = document.getElementById("patient-tab-bar");
      if (ptTabBar) ptTabBar.innerHTML = "";

      // Clear drug tab bar & detail text
      const drugTabBar = document.getElementById("drug-tab-bar");
      if (drugTabBar) drugTabBar.innerHTML = "";
      const drugDetail = document.getElementById("drug-detail-content");
      if (drugDetail) {
        drugDetail.innerHTML =
          '<p class="muted">Select a drug from the list on the left.</p>';
      }

      showLoginScreen();
      refreshBrainAssignedList();
    });
  }

  navTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      navTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      const viewName = tab.dataset.view; // "brain", "patient-list", "drug-manual"
      setActiveView(viewName);
    });
  });
}

function restoreSessionIfExists() {
  const user = getSessionUser();
  if (user) {
    currentUser = user;
    showMainApp(user);
  } else {
    showLoginScreen();
  }
}

function showMainApp(user) {
  const loginScreen = document.getElementById("login-screen");
  const mainApp = document.getElementById("main-app");
  const usernameDisplay = document.getElementById("nav-username");

  if (loginScreen) loginScreen.classList.remove("active");
  if (mainApp) mainApp.classList.add("active");
  if (usernameDisplay && user) usernameDisplay.textContent = user.username;

  setActiveView("brain");
  setActiveTab("brain");

  // Clean patient tabs on login
  const ptTabBar = document.getElementById("patient-tab-bar");
  if (ptTabBar) ptTabBar.innerHTML = "";
  openPatientTabs.clear();
  patientCharts.clear();

  refreshBrainAssignedList();
  renderDrugList(); // if drugs already loaded, show them
}

function showLoginScreen() {
  const loginScreen = document.getElementById("login-screen");
  const mainApp = document.getElementById("main-app");

  if (mainApp) mainApp.classList.remove("active");
  if (loginScreen) loginScreen.classList.add("active");
}

/************ VIEW HELPERS ************/

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

/************ PATIENT LIST ************/

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
    refreshBrainAssignedList();
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

    // Clicking a row just opens/ensures a tab; no auto-switch
    tr.addEventListener("click", () => {
      openPatientTab(p.patientNumber);
    });

    tbody.appendChild(tr);
  });
}

/************ PATIENT TABS (ROW 2) ************/

function openPatientTab(patientNumber) {
  const patient = patientsData.find((p) => p.patientNumber === patientNumber);
  if (!patient) return;

  const tabBar = document.getElementById("patient-tab-bar");
  if (!tabBar) return;

  if (!openPatientTabs.has(patientNumber)) {
    const tabEl = document.createElement("button");
    tabEl.className = "patient-tab";
    tabEl.dataset.patientNumber = patientNumber;
    tabEl.innerHTML = `
      <span class="patient-tab-label">${escapeHtml(
        patient.lastName
      )}, ${escapeHtml(patient.firstName)}</span>
      <span class="tab-close" aria-label="Close tab">&times;</span>
    `;

    tabEl.addEventListener("click", (e) => {
      if (e.target.closest(".tab-close")) {
        e.stopPropagation();
        closePatientTab(patientNumber);
      } else {
        activatePatientTab(patientNumber);
      }
    });

    tabBar.appendChild(tabEl);
    openPatientTabs.set(patientNumber, tabEl);
  }
  // No auto-activate here; user clicks tab to open
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

/************ PATIENT CHART LOAD + RENDER ************/

async function loadAndRenderPatientChart(patientNumber) {
  const summaryRow = patientsData.find((p) => p.patientNumber === patientNumber);
  let chart = null;

  try {
    const res = await fetch(`data/patients/${patientNumber}.json`);
    if (res.ok) {
      chart = await res.json();
    }
  } catch (err) {
    console.error("Error loading patient JSON", err);
  }

  if (!chart && summaryRow) {
    chart = buildFallbackChartFromCsv(summaryRow);
  }

  if (!chart) {
    console.error("No chart or CSV row for patient", patientNumber);
    return;
  }

  if (!chart.assignedNurses) chart.assignedNurses = [];
  if (!chart.medications) chart.medications = { activeOrders: [], mar: [] };
  if (!chart.demographics && summaryRow) {
    chart.demographics = buildFallbackChartFromCsv(summaryRow).demographics;
  }
  if (chart.demographics && !chart.demographics.precautions) {
    chart.demographics.precautions = "None documented";
  }

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
      allergies: row.allergies || "No Known Allergies",
      unit: "",
      room: "",
      precautions: "None documented"
    },
    diagnoses: [],
    orders: [],
    vitalsLog: [],
    assessments: [],
    medications: { activeOrders: [], mar: [] },
    assignedNurses: []
  };
}

/************ ASSIGN / UNASSIGN (SESSION ONLY) ************/

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

  patientCharts.set(patientNumber, chart);
  renderPatientDetail(chart);
  refreshBrainAssignedList();
}

/************ BRAIN: ASSIGNED PATIENTS ************/

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
    container.innerHTML =
      `<p class="muted">You are not currently assigned to any patients.</p>`;
    return;
  }

  const rows = assigned
    .map((chart) => {
      const d = chart.demographics || {};
      const name = `${(d.lastName || "").toUpperCase()}, ${
        d.firstName || ""
      }`;
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

/************ PATIENT DETAIL + INTERNAL TABS ************/

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

  const lastName = d.lastName || "";
  const firstName = d.firstName || "";
  const age = d.age != null ? d.age : "";
  const gender = d.gender || "";
  const dob = d.dateOfBirth || "";
  const weight = d.weightKg != null ? d.weightKg + " kg" : "";
  const unit = d.unit || "";
  const room = d.room || "";
  const allergies = d.allergies || "No Known Allergies";
  const precautions = d.precautions || "None documented";

  container.innerHTML = `
    <section class="patient-banner">
      <div class="patient-banner-main">
        <div class="patient-name-line">
          ${escapeHtml(lastName).toUpperCase()}, ${escapeHtml(firstName)}
        </div>
        <div class="patient-banner-row">
          <span>Patient # ${chart.patientNumber || ""}</span>
          ${age !== "" ? `<span>Age: ${age}</span>` : ""}
          ${gender ? `<span>Gender: ${escapeHtml(gender)}</span>` : ""}
        </div>
        <div class="patient-banner-row">
          <span>DOB: ${escapeHtml(dob || "—")}</span>
        </div>
        <div class="patient-banner-row">
          <span>Weight: ${escapeHtml(weight || "—")}</span>
        </div>
        <div class="patient-banner-row">
          <span>Unit: ${escapeHtml(unit || "—")}</span>
          <span>Room: ${escapeHtml(room || "—")}</span>
        </div>
        <div class="patient-banner-row">
          <span class="banner-allergies">
            Allergies: ${escapeHtml(allergies)}
          </span>
        </div>
        <div class="patient-banner-row">
          <span class="banner-precautions">
            Precautions: ${escapeHtml(precautions)}
          </span>
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

    <div class="chart-subnav">
      <button class="chart-tab active" data-chart-view="summary">Summary</button>
      <button class="chart-tab" data-chart-view="orders">Orders</button>
      <button class="chart-tab" data-chart-view="flowsheet">Flowsheet</button>
      <button class="chart-tab" data-chart-view="mar">MAR</button>
    </div>

    <div id="patient-chart-views">
      <div id="chart-summary" class="chart-view active">
        <section class="patient-info-grid">
          <div class="info-item">
            <div class="info-label">First Name</div>
            <div class="info-value">
              ${
                isAdmin
                  ? `<input id="edit-first-name" value="${escapeHtml(
                      firstName
                    )}">`
                  : escapeHtml(firstName)
              }
            </div>
          </div>

          <div class="info-item">
            <div class="info-label">Last Name</div>
            <div class="info-value">
              ${
                isAdmin
                  ? `<input id="edit-last-name" value="${escapeHtml(
                      lastName
                    )}">`
                  : escapeHtml(lastName)
              }
            </div>
          </div>

          <div class="info-item">
            <div class="info-label">Date of Birth</div>
            <div class="info-value">
              ${
                isAdmin
                  ? `<input id="edit-dob" value="${escapeHtml(dob)}">`
                  : escapeHtml(dob)
              }
            </div>
          </div>

          <div class="info-item">
            <div class="info-label">Age</div>
            <div class="info-value">
              ${
                isAdmin
                  ? `<input id="edit-age" type="number" value="${age}">`
                  : age
              }
            </div>
          </div>

          <div class="info-item">
            <div class="info-label">Weight (kg)</div>
            <div class="info-value">
              ${
                isAdmin
                  ? `<input id="edit-weight" type="number" step="0.1" value="${
                      d.weightKg ?? ""
                    }">`
                  : weight
              }
            </div>
          </div>

          <div class="info-item">
            <div class="info-label">Gender</div>
            <div class="info-value">
              ${
                isAdmin
                  ? `<input id="edit-gender" value="${escapeHtml(gender)}">`
                  : escapeHtml(gender)
              }
            </div>
          </div>

          <div class="info-item">
            <div class="info-label">Allergies</div>
            <div class="info-value">
              ${
                isAdmin
                  ? `<input id="edit-allergies" value="${escapeHtml(
                      allergies
                    )}">`
                  : `<span class="banner-allergies">${escapeHtml(
                      allergies
                    )}</span>`
              }
            </div>
          </div>

          <div class="info-item">
            <div class="info-label">Precautions</div>
            <div class="info-value">
              ${
                isAdmin
                  ? `<input id="edit-precautions" value="${escapeHtml(
                      precautions
                    )}">`
                  : `<span class="banner-precautions">${escapeHtml(
                      precautions
                    )}</span>`
              }
            </div>
          </div>

          <div class="info-item">
            <div class="info-label">Unit</div>
            <div class="info-value">
              ${
                isAdmin
                  ? `<input id="edit-unit" value="${escapeHtml(unit)}">`
                  : escapeHtml(unit)
              }
            </div>
          </div>

          <div class="info-item">
            <div class="info-label">Room</div>
            <div class="info-value">
              ${
                isAdmin
                  ? `<input id="edit-room" value="${escapeHtml(room)}">`
                  : escapeHtml(room)
              }
            </div>
          </div>

          <div class="info-item">
            <div class="info-label">Primary Diagnosis</div>
            <div class="info-value">
              ${
                isAdmin
                  ? `<input id="edit-primary-dx" value="${escapeHtml(
                      primaryDx || ""
                    )}">`
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
            <div class="info-value">${
              (chart.medications?.mar || []).length
            }</div>
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
      </div>

      <div id="chart-orders" class="chart-view">
        <p class="muted">Orders view coming soon.</p>
      </div>

      <div id="chart-flowsheet" class="chart-view">
        <p class="muted">Flowsheet view coming soon.</p>
      </div>

      <div id="chart-mar" class="chart-view">
        <p class="muted">MAR view coming soon.</p>
      </div>
    </div>
  `;

  const assignBtn = document.getElementById("assign-btn");
  if (assignBtn && currentUser) {
    assignBtn.addEventListener("click", () => {
      toggleAssignment(chart.patientNumber);
    });
  }

  const chartTabs = container.querySelectorAll(".chart-tab");
  const chartViews = container.querySelectorAll(".chart-view");
  chartTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      chartTabs.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const view = btn.dataset.chartView;
      chartViews.forEach((v) => v.classList.remove("active"));
      const activeView = container.querySelector(`#chart-${view}`);
      if (activeView) activeView.classList.add("active");
    });
  });

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

      d2.gender = getVal("edit-gender");
      d2.allergies = getVal("edit-allergies") || "No Known Allergies";
      d2.precautions = getVal("edit-precautions") || "None documented";
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
        patientCharts.set(chart.patientNumber, chart);
        renderPatientDetail(chart);
        refreshBrainAssignedList();
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        applyAdminEdits();
        patientCharts.set(chart.patientNumber, chart);
        exportChartAsJson(chart);
      });
    }
  }
}

/************ DRUG MANUAL ************/

async function loadDrugs() {
  try {
    const res = await fetch("data/drugs/drugs.json");
    if (!res.ok) {
      console.error("Failed to load drugs.json", res.status);
      return;
    }
    const data = await res.json();
    drugsList = (data || []).slice().sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    renderDrugList();
  } catch (err) {
    console.error("Error loading drug manifest", err);
  }
}

function renderDrugList() {
  const container = document.getElementById("drug-list");
  if (!container) return;

  if (!drugsList || drugsList.length === 0) {
    container.innerHTML = `<p class="muted">No drugs loaded.</p>`;
    return;
  }

  container.innerHTML = drugsList
    .map(
      (d) => `
      <button class="drug-list-item" data-drug-id="${d.id}">
        ${escapeHtml(d.name)}
      </button>
    `
    )
    .join("");

  container.querySelectorAll(".drug-list-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.drugId;
      if (!id) return;
      openDrugTab(id);
      activateDrugTab(id);
    });
  });
}

function openDrugTab(drugId) {
  const drug = drugsList.find((d) => d.id === drugId);
  if (!drug) return;

  const tabBar = document.getElementById("drug-tab-bar");
  if (!tabBar) return;

  if (!openDrugTabs.has(drugId)) {
    const tabEl = document.createElement("button");
    tabEl.className = "drug-tab";
    tabEl.dataset.drugId = drugId;
    tabEl.innerHTML = `
      <span class="drug-tab-label">${escapeHtml(drug.name)}</span>
      <span class="drug-tab-close" aria-label="Close tab">&times;</span>
    `;

    tabEl.addEventListener("click", (e) => {
      if (e.target.closest(".drug-tab-close")) {
        e.stopPropagation();
        closeDrugTab(drugId);
      } else {
        activateDrugTab(drugId);
      }
    });

    tabBar.appendChild(tabEl);
    openDrugTabs.set(drugId, tabEl);
  }
}

function activateDrugTab(drugId) {
  for (const [id, el] of openDrugTabs.entries()) {
    if (id === drugId) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  }

  loadAndRenderDrug(drugId);
}

function closeDrugTab(drugId) {
  const tabEl = openDrugTabs.get(drugId);
  if (!tabEl) return;

  const isActive = tabEl.classList.contains("active");
  tabEl.remove();
  openDrugTabs.delete(drugId);

  const detail = document.getElementById("drug-detail-content");
  if (!detail) return;

  if (isActive) {
    const remaining = Array.from(openDrugTabs.keys());
    if (remaining.length > 0) {
      const last = remaining[remaining.length - 1];
      activateDrugTab(last);
    } else {
      detail.innerHTML =
        '<p class="muted">Select a drug from the list on the left.</p>';
    }
  }
}

async function loadAndRenderDrug(drugId) {
  if (!drugId) return;

  let drug = drugDetails.get(drugId);
  if (!drug) {
    try {
      const res = await fetch(`data/drugs/${drugId}.json`);
      if (!res.ok) {
        console.error("Failed to load drug file for", drugId, res.status);
        return;
      }
      drug = await res.json();
      drugDetails.set(drugId, drug);
    } catch (err) {
      console.error("Error loading drug JSON", err);
      return;
    }
  }

  renderDrugDetail(drug);
}

function renderDrugDetail(drug) {
  const container = document.getElementById("drug-detail-content");
  if (!container) return;

  const name = drug.name || "";
  const klass = drug.class || "";
  const summary = drug.summary || "";
  const indications = drug.indications || [];
  const sideEffects = drug.sideEffects || [];
  const cautions = drug.cautions || [];
  const compatibility = drug.compatibility || {};
  const standardDose = drug.standardDose || "See institutional guidelines.";
  const minSafe = drug.minSafeDoseMgPerKgPerDay;
  const maxSafe = drug.maxSafeDoseMgPerKgPerDay;

  container.innerHTML = `
    <div class="drug-card">
      <h3 class="drug-name">${escapeHtml(name)}</h3>
      <p class="drug-class">${escapeHtml(klass)}</p>

      <section class="drug-section">
        <h4>Summary</h4>
        <p>${escapeHtml(summary)}</p>
      </section>

      <section class="drug-section">
        <h4>Indications</h4>
        ${
          indications.length
            ? `<ul>${indications
                .map((i) => `<li>${escapeHtml(i)}</li>`)
                .join("")}</ul>`
            : `<p class="muted">No indications listed.</p>`
        }
      </section>

      <section class="drug-section">
        <h4>Side Effects</h4>
        ${
          sideEffects.length
            ? `<ul>${sideEffects
                .map((s) => `<li>${escapeHtml(s)}</li>`)
                .join("")}</ul>`
            : `<p class="muted">No side effects listed.</p>`
        }
      </section>

      <section class="drug-section">
        <h4>Cautions</h4>
        ${
          cautions.length
            ? `<ul>${cautions
                .map((c) => `<li>${escapeHtml(c)}</li>`)
                .join("")}</ul>`
            : `<p class="muted">No cautions listed.</p>`
        }
      </section>

      <section class="drug-section">
        <h4>Compatibility</h4>
        <ul>
          ${
            compatibility.iv
              ? `<li><strong>IV:</strong> ${escapeHtml(compatibility.iv)}</li>`
              : ""
          }
          ${
            compatibility.oral
              ? `<li><strong>Oral:</strong> ${escapeHtml(
                  compatibility.oral
                )}</li>`
              : ""
          }
          ${
            compatibility.other
              ? `<li><strong>Other:</strong> ${escapeHtml(
                  compatibility.other
                )}</li>`
              : ""
          }
        </ul>
      </section>

      <section class="drug-section">
        <h4>Dosing (Educational Only)</h4>
        <p><strong>Standard order example:</strong> ${escapeHtml(
          standardDose
        )}</p>
        <p class="muted">
          Min/Max mg/kg/day are intentionally left null here and should be filled
          from a trusted institutional or pharmacology reference when you build
          scenarios.
        </p>
        <ul>
          <li><strong>Min safe (mg/kg/day):</strong> ${
            minSafe != null ? minSafe : "–"
          }</li>
          <li><strong>Max safe (mg/kg/day):</strong> ${
            maxSafe != null ? maxSafe : "–"
          }</li>
        </ul>
      </section>
    </div>
  `;
}
