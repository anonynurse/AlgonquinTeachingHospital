// Algonquin Digital Hospital - core client logic
// Plain ES5-style JavaScript, no modules/imports.

/* =========================
   SIMPLE AUTH CONFIG
   ========================= */

var USERS = {
  admin: { password: "password", role: "admin" },
  sn001: { password: "password", role: "student" },
  sn002: { password: "password", role: "student" },
  sn003: { password: "password", role: "student" },
  sn004: { password: "password", role: "student" }
};

var currentUser = null; // { username, role }

/* =========================
   APP STATE
   ========================= */

// Patient roster from CSV
var patientsData = []; // array of simple patient rows

// Patient charts in memory: patientNumber -> chart object
var patientCharts = {}; // { "123456": { ...chart... } }

// Open patient tabs (second row): array of { patientNumber, element }
var openPatientTabs = [];

// Drug library
var drugsList = [];      // from data/drugs/drugs.json
var drugDetails = {};    // id -> full JSON
var openDrugTabs = [];   // array of { id, element }

/* =========================
   UTILITIES
   ========================= */

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* =========================
   ENTRY POINT
   ========================= */

document.addEventListener("DOMContentLoaded", function () {
  try {
    setupLogin();
    setupNav();
    loadPatients();
    loadDrugs();
    showLoginScreen();
  } catch (e) {
    console.error("Initialization error:", e);
  }
});

/* =========================
   LOGIN + NAV
   ========================= */

function setupLogin() {
  var form = document.getElementById("login-form");
  if (!form) return;

  var errorEl = document.getElementById("login-error");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (errorEl) errorEl.textContent = "";

    var usernameInput =
      form.querySelector("input[name='username']") ||
      document.getElementById("username");
    var passwordInput =
      form.querySelector("input[name='password']") ||
      document.getElementById("password");

    var username = usernameInput ? usernameInput.value.trim() : "";
    var password = passwordInput ? passwordInput.value : "";

    var user = authenticate(username, password);
    if (!user) {
      if (errorEl) errorEl.textContent = "Invalid username or password.";
      return;
    }

    currentUser = user;
    form.reset();
    showMainApp();
  });
}

function authenticate(username, password) {
  var rec = USERS[username];
  if (!rec) return null;
  if (rec.password !== password) return null;
  return { username: username, role: rec.role };
}

function setupNav() {
  var logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      currentUser = null;

      // Clear patient tabs and charts
      var ptTabBar = document.getElementById("patient-tab-bar");
      if (ptTabBar) ptTabBar.innerHTML = "";
      openPatientTabs = [];
      patientCharts = {};

      // Clear drug tabs and detail panel
      var drugTabBar = document.getElementById("drug-tab-bar");
      if (drugTabBar) drugTabBar.innerHTML = "";
      openDrugTabs = [];
      var drugDetail = document.getElementById("drug-detail-content");
      if (drugDetail) {
        drugDetail.innerHTML =
          '<p class="muted">Select a drug from the list on the left.</p>';
      }

      refreshBrainAssignedList();
      showLoginScreen();
    });
  }

  var navTabs = document.querySelectorAll(".nav-tab");
  for (var i = 0; i < navTabs.length; i++) {
    (function (tab) {
      tab.addEventListener("click", function () {
        var viewName = tab.getAttribute("data-view");
        setActiveTab(viewName);
        setActiveView(viewName);
      });
    })(navTabs[i]);
  }
}

function showMainApp() {
  console.log("showMainApp called, currentUser =", currentUser);

  var loginScreen = document.getElementById("login-screen");
  var mainApp = document.getElementById("main-app");
  var usernameDisplay = document.getElementById("nav-username");

  // Hard override of visibility using inline styles
  if (loginScreen) {
    loginScreen.style.display = "none";
  }
  if (mainApp) {
    // If your main app layout uses flex, you can do "flex" instead
    mainApp.style.display = "block";
  }

  if (usernameDisplay && currentUser) {
    usernameDisplay.textContent = currentUser.username;
  }

  // Still set the initial view to Brain
  setActiveTab("brain");
  setActiveView("brain");
  refreshBrainAssignedList();
}

function showLoginScreen() {
  console.log("showLoginScreen called");

  var loginScreen = document.getElementById("login-screen");
  var mainApp = document.getElementById("main-app");

  if (mainApp) {
    mainApp.style.display = "none";
  }
  if (loginScreen) {
    loginScreen.style.display = "flex"; 
  }
}


function setActiveView(viewName) {
  var views = document.querySelectorAll(".view");
  for (var i = 0; i < views.length; i++) {
    views[i].classList.remove("active");
  }
  var target = document.getElementById("view-" + viewName);
  if (target) target.classList.add("active");
}

function setActiveTab(viewName) {
  var tabs = document.querySelectorAll(".nav-tab");
  for (var i = 0; i < tabs.length; i++) {
    var v = tabs[i].getAttribute("data-view");
    if (v === viewName) {
      tabs[i].classList.add("active");
    } else {
      tabs[i].classList.remove("active");
    }
  }
}

/* =========================
   PATIENT LIST
   ========================= */

function loadPatients() {
  if (!window.fetch) {
    console.warn("fetch() not available; patients.csv will not load.");
    return;
  }

  fetch("data/patients.csv")
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    })
    .then(function (text) {
      patientsData = parsePatientsCsv(text);
      renderPatientList();
    })
    .catch(function (err) {
      console.warn("Error loading patients.csv:", err);
    });
}

function parsePatientsCsv(text) {
  var lines = text.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];

  var header = lines[0]; // unused but kept
  var dataLines = lines.slice(1);
  var out = [];

  for (var i = 0; i < dataLines.length; i++) {
    var line = dataLines[i].trim();
    if (!line) continue;
    var cols = line.split(",").map(function (c) {
      return c.trim().replace(/^"|"$/g, "");
    });

    out.push({
      patientNumber: cols[0],
      lastName: cols[1],
      firstName: cols[2],
      gender: cols[3],
      dob: cols[4],
      age: cols[5],
      weight: cols[6],
      allergies: cols[7] || ""
    });
  }

  return out;
}

function renderPatientList() {
  var tbody = document.getElementById("patient-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  for (var i = 0; i < patientsData.length; i++) {
    (function (p) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-patient-number", p.patientNumber);

      tr.innerHTML =
        "<td>" + escapeHtml(p.patientNumber) + "</td>" +
        "<td>" + escapeHtml(p.lastName) + "</td>" +
        "<td>" + escapeHtml(p.firstName) + "</td>" +
        "<td>" + escapeHtml(p.gender) + "</td>" +
        "<td>" + escapeHtml(p.dob) + "</td>" +
        "<td>" + escapeHtml(p.age) + "</td>" +
        "<td>" + escapeHtml(p.weight) + "</td>" +
        "<td>" + escapeHtml(p.allergies) + "</td>";

      tr.addEventListener("click", function () {
        openPatientTab(p.patientNumber);
      });

      tbody.appendChild(tr);
    })(patientsData[i]);
  }
}

/* =========================
   PATIENT TABS (SECOND ROW)
   ========================= */

function findPatientTabIndex(patientNumber) {
  for (var i = 0; i < openPatientTabs.length; i++) {
    if (openPatientTabs[i].patientNumber === patientNumber) return i;
  }
  return -1;
}

function openPatientTab(patientNumber) {
  var pt = findPatientRow(patientNumber);
  if (!pt) return;

  var tabBar = document.getElementById("patient-tab-bar");
  if (!tabBar) return;

  if (findPatientTabIndex(patientNumber) === -1) {
    var tabEl = document.createElement("button");
    tabEl.className = "patient-tab";
    tabEl.setAttribute("data-patient-number", patientNumber);
    tabEl.innerHTML =
      '<span class="patient-tab-label">' +
      escapeHtml(pt.lastName) + ", " + escapeHtml(pt.firstName) +
      '</span>' +
      '<span class="tab-close" aria-label="Close tab">&times;</span>';

    tabEl.addEventListener("click", function (e) {
      var target = e.target || e.srcElement;
      if (target && target.classList && target.classList.contains("tab-close")) {
        e.stopPropagation();
        closePatientTab(patientNumber);
      } else {
        activatePatientTab(patientNumber);
      }
    });

    tabBar.appendChild(tabEl);
    openPatientTabs.push({ patientNumber: patientNumber, element: tabEl });
  }
  // Do NOT auto-activate; user clicks the tab body to activate.
}

function activatePatientTab(patientNumber) {
  for (var i = 0; i < openPatientTabs.length; i++) {
    var entry = openPatientTabs[i];
    if (!entry || !entry.element) continue;
    if (entry.patientNumber === patientNumber) {
      entry.element.classList.add("active");
    } else {
      entry.element.classList.remove("active");
    }
  }

  loadAndRenderPatientChart(patientNumber);
}

function closePatientTab(patientNumber) {
  var idx = findPatientTabIndex(patientNumber);
  if (idx === -1) return;

  var tabEntry = openPatientTabs[idx];
  var wasActive =
    tabEntry.element &&
    tabEntry.element.classList.contains("active");

  if (tabEntry.element && tabEntry.element.parentNode) {
    tabEntry.element.parentNode.removeChild(tabEntry.element);
  }

  openPatientTabs.splice(idx, 1);

  if (wasActive) {
    if (openPatientTabs.length > 0) {
      var last = openPatientTabs[openPatientTabs.length - 1];
      activatePatientTab(last.patientNumber);
    } else {
      setActiveTab("patient-list");
      setActiveView("patient-list");
    }
  }
}

function findPatientRow(patientNumber) {
  for (var i = 0; i < patientsData.length; i++) {
    if (patientsData[i].patientNumber === patientNumber) {
      return patientsData[i];
    }
  }
  return null;
}

/* =========================
   PATIENT CHART
   ========================= */

function loadAndRenderPatientChart(patientNumber) {
  var row = findPatientRow(patientNumber);
  if (!row) {
    console.warn("No CSV row for patient", patientNumber);
    return;
  }

  // If we already have a chart loaded in memory, just use it.
  if (patientCharts[patientNumber]) {
    renderPatientDetail(patientCharts[patientNumber]);
    setActiveView("patient-detail");
    refreshBrainAssignedList();
    return;
  }

  if (!window.fetch) {
    // No fetch; just build from CSV
    var chartFallback = buildChartFromRow(row);
    patientCharts[patientNumber] = chartFallback;
    renderPatientDetail(chartFallback);
    setActiveView("patient-detail");
    refreshBrainAssignedList();
    return;
  }

  // Try to load JSON; if that fails, fallback to CSV
  fetch("data/patients/" + patientNumber + ".json")
    .then(function (res) {
      if (!res.ok) throw new Error("No JSON for this patient");
      return res.json();
    })
    .then(function (json) {
      var chart = normalizeChartJson(json, row);
      patientCharts[patientNumber] = chart;
      renderPatientDetail(chart);
      setActiveView("patient-detail");
      refreshBrainAssignedList();
    })
    .catch(function () {
      var chart = buildChartFromRow(row);
      patientCharts[patientNumber] = chart;
      renderPatientDetail(chart);
      setActiveView("patient-detail");
      refreshBrainAssignedList();
    });
}

function buildChartFromRow(row) {
  return {
    patientNumber: row.patientNumber,
    demographics: {
      firstName: row.firstName,
      lastName: row.lastName,
      gender: row.gender,
      dateOfBirth: row.dob,
      age: row.age,
      weightKg: row.weight,
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

function normalizeChartJson(json, row) {
  var chart = json || {};
  chart.patientNumber = chart.patientNumber || (row && row.patientNumber) || "";

  if (!chart.demographics) chart.demographics = {};
  var d = chart.demographics;

  d.firstName = d.firstName || (row && row.firstName) || "";
  d.lastName = d.lastName || (row && row.lastName) || "";
  d.gender = d.gender || (row && row.gender) || "";
  d.dateOfBirth = d.dateOfBirth || (row && row.dob) || "";
  d.age = d.age || (row && row.age) || "";
  d.weightKg = d.weightKg || (row && row.weight) || "";
  d.allergies = d.allergies || (row && row.allergies) || "No Known Allergies";
  d.unit = d.unit || "";
  d.room = d.room || "";
  d.precautions = d.precautions || "None documented";

  if (!chart.diagnoses) chart.diagnoses = [];
  if (!chart.orders) chart.orders = [];
  if (!chart.vitalsLog) chart.vitalsLog = [];
  if (!chart.assessments) chart.assessments = [];
  if (!chart.medications) chart.medications = { activeOrders: [], mar: [] };
  if (!chart.assignedNurses) chart.assignedNurses = [];

  return chart;
}

function renderPatientDetail(chart) {
  var container = document.getElementById("patient-detail-content");
  if (!container) return;

  var d = chart.demographics || {};
  var diagnoses = chart.diagnoses || [];
  var primaryDx = diagnoses.length ? (diagnoses[0].description || "N/A") : "N/A";

  var isAssigned = false;
  if (currentUser && chart.assignedNurses) {
    for (var i = 0; i < chart.assignedNurses.length; i++) {
      if (chart.assignedNurses[i] === currentUser.username) {
        isAssigned = true;
        break;
      }
    }
  }

  var html = "";

  // Banner
  html += '<section class="patient-banner">';
  html += '  <div class="patient-banner-main">';
  html += '    <div class="patient-name-line">' +
    escapeHtml((d.lastName || "").toUpperCase()) + ", " +
    escapeHtml(d.firstName || "") + "</div>";
  html += '    <div class="patient-banner-row">';
  html += '      <span>Patient # ' + escapeHtml(chart.patientNumber || "") + "</span>";
  if (d.age !== null && d.age !== undefined && d.age !== "") {
    html += '      <span>Age: ' + escapeHtml(d.age) + "</span>";
  }
  if (d.gender) {
    html += '      <span>Gender: ' + escapeHtml(d.gender) + "</span>";
  }
  html += "    </div>";
  html += '    <div class="patient-banner-row">';
  html += '      <span>DOB: ' + escapeHtml(d.dateOfBirth || "—") + "</span>";
  html += "    </div>";
  html += '    <div class="patient-banner-row">';
  html += '      <span>Weight: ' + escapeHtml(d.weightKg || "—") + "</span>";
  html += "    </div>";
  html += '    <div class="patient-banner-row">';
  html += '      <span>Unit: ' + escapeHtml(d.unit || "—") + "</span>";
  html += '      <span>Room: ' + escapeHtml(d.room || "—") + "</span>";
  html += "    </div>";
  html += '    <div class="patient-banner-row">';
  html += '      <span class="banner-allergies">Allergies: ' +
    escapeHtml(d.allergies || "No Known Allergies") + "</span>";
  html += "    </div>";
  html += '    <div class="patient-banner-row">';
  html += '      <span class="banner-precautions">Precautions: ' +
    escapeHtml(d.precautions || "None documented") + "</span>";
  html += "    </div>";
  html += "  </div>";
  if (currentUser) {
    html +=
      '  <button id="assign-btn" class="btn-secondary btn-assign">' +
      (isAssigned ? "Unassign Me" : "Assign Me") +
      "</button>";
  }
  html += "</section>";

  // Internal chart tabs
  html += '<div class="chart-subnav">';
  html += '  <button class="chart-tab active" data-chart-view="summary">Summary</button>';
  html += '  <button class="chart-tab" data-chart-view="orders">Orders</button>';
  html += '  <button class="chart-tab" data-chart-view="flowsheet">Flowsheet</button>';
  html += '  <button class="chart-tab" data-chart-view="mar">MAR</button>';
  html += "</div>";

  html += '<div id="patient-chart-views">';

  // Summary
  html += '  <div id="chart-summary" class="chart-view active">';
  html += '    <section class="patient-info-grid">';
  html += infoRow("First Name", d.firstName);
  html += infoRow("Last Name", d.lastName);
  html += infoRow("Date of Birth", d.dateOfBirth);
  html += infoRow("Age", d.age);
  html += infoRow("Weight (kg)", d.weightKg);
  html += infoRow("Gender", d.gender);
  html += infoRow("Allergies", d.allergies || "No Known Allergies");
  html += infoRow("Precautions", d.precautions || "None documented");
  html += infoRow("Unit", d.unit);
  html += infoRow("Room", d.room);
  html += infoRow("Primary Diagnosis", primaryDx);
  html += "    </section>";
  html += "  </div>";

  // Orders
  html += '  <div id="chart-orders" class="chart-view">';
  html += '    <p class="muted">Orders view coming later.</p>';
  html += "  </div>";

  // Flowsheet
  html += '  <div id="chart-flowsheet" class="chart-view">';
  html += '    <p class="muted">Flowsheet view coming later.</p>';
  html += "  </div>";

  // MAR
  html += '  <div id="chart-mar" class="chart-view">';
  html += '    <p class="muted">MAR view coming later.</p>';
  html += "  </div>";

  html += "</div>";

  container.innerHTML = html;

  // Assign/Unassign button
  var assignBtn = document.getElementById("assign-btn");
  if (assignBtn && currentUser) {
    assignBtn.addEventListener("click", function () {
      toggleAssignment(chart.patientNumber);
    });
  }

  // Internal chart tabs
  var chartTabs = container.querySelectorAll(".chart-tab");
  var chartViews = container.querySelectorAll(".chart-view");
  for (var i = 0; i < chartTabs.length; i++) {
    (function (btn) {
      btn.addEventListener("click", function () {
        var view = btn.getAttribute("data-chart-view");

        for (var j = 0; j < chartTabs.length; j++) {
          chartTabs[j].classList.remove("active");
        }
        btn.classList.add("active");

        for (var k = 0; k < chartViews.length; k++) {
          chartViews[k].classList.remove("active");
        }
        var vEl = container.querySelector("#chart-" + view);
        if (vEl) vEl.classList.add("active");
      });
    })(chartTabs[i]);
  }
}

function infoRow(label, value) {
  return (
    '<div class="info-item">' +
    '<div class="info-label">' + escapeHtml(label) + "</div>" +
    '<div class="info-value">' + escapeHtml(value || "—") + "</div>" +
    "</div>"
  );
}

/* =========================
   ASSIGN / BRAIN
   ========================= */

function toggleAssignment(patientNumber) {
  if (!currentUser) return;
  var chart = patientCharts[patientNumber];
  if (!chart) return;
  if (!chart.assignedNurses) chart.assignedNurses = [];

  var uname = currentUser.username;
  var idx = -1;
  for (var i = 0; i < chart.assignedNurses.length; i++) {
    if (chart.assignedNurses[i] === uname) {
      idx = i;
      break;
    }
  }

  if (idx === -1) {
    chart.assignedNurses.push(uname);
  } else {
    chart.assignedNurses.splice(idx, 1);
  }

  patientCharts[patientNumber] = chart;
  renderPatientDetail(chart);
  refreshBrainAssignedList();
}

function refreshBrainAssignedList() {
  var container = document.getElementById("brain-assigned-list");
  if (!container) return;

  if (!currentUser) {
    container.innerHTML = '<p class="muted">Not logged in.</p>';
    return;
  }

  var rows = "";

  for (var pn in patientCharts) {
    if (!patientCharts.hasOwnProperty(pn)) continue;
    var chart = patientCharts[pn];
    if (!chart.assignedNurses) continue;

    var assigned = false;
    for (var i = 0; i < chart.assignedNurses.length; i++) {
      if (chart.assignedNurses[i] === currentUser.username) {
        assigned = true;
        break;
      }
    }
    if (!assigned) continue;

    var d = chart.demographics || {};
    var name =
      escapeHtml((d.lastName || "").toUpperCase()) +
      ", " + escapeHtml(d.firstName || "");
    var unit = escapeHtml(d.unit || "");
    var room = escapeHtml(d.room || "");

    rows +=
      '<tr data-patient-number="' + escapeHtml(pn) + '">' +
      "<td>" + escapeHtml(pn) + "</td>" +
      "<td>" + name + "</td>" +
      "<td>" + unit + "</td>" +
      "<td>" + room + "</td>" +
      "</tr>";
  }

  if (!rows) {
    container.innerHTML =
      '<p class="muted">You are not currently assigned to any patients.</p>';
    return;
  }

  var html =
    '<div class="table-wrapper">' +
    '<table class="patient-table">' +
    "<thead>" +
    "<tr>" +
    "<th>Patient #</th>" +
    "<th>Name</th>" +
    "<th>Unit</th>" +
    "<th>Room</th>" +
    "</tr>" +
    "</thead>" +
    "<tbody>" +
    rows +
    "</tbody>" +
    "</table>" +
    "</div>";

  container.innerHTML = html;

  var trs = container.querySelectorAll("tbody tr");
  for (var j = 0; j < trs.length; j++) {
    (function (tr) {
      var pn = tr.getAttribute("data-patient-number");
      tr.addEventListener("click", function () {
        if (!pn) return;
        openPatientTab(pn);
        activatePatientTab(pn);
      });
    })(trs[j]);
  }
}

/* =========================
   DRUG MANUAL (NO TABS)
   ========================= */

function loadDrugs() {
  if (!window.fetch) {
    console.warn("fetch() not available; drugs.json will not load.");
    return;
  }

  fetch("data/drugs/drugs.json")
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      if (!data || !data.length) {
        drugsList = [];
      } else {
        data.sort(function (a, b) {
          return (a.name || "").localeCompare(b.name || "");
        });
        drugsList = data;
      }
      renderDrugList();
    })
    .catch(function (err) {
      console.warn("Error loading drugs.json:", err);
      drugsList = [];
      renderDrugList();
    });
}

function renderDrugList() {
  var container = document.getElementById("drug-list");
  if (!container) return;

  if (!drugsList.length) {
    container.innerHTML = '<p class="muted">No drugs loaded.</p>';
    return;
  }

  var html = "";
  for (var i = 0; i < drugsList.length; i++) {
    var d = drugsList[i];
    html +=
      '<button class="drug-list-item" data-drug-id="' + escapeHtml(d.id) + '">' +
      escapeHtml(d.name) +
      "</button>";
  }
  container.innerHTML = html;

  var buttons = container.querySelectorAll(".drug-list-item");
  for (var j = 0; j < buttons.length; j++) {
    (function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-drug-id");
        if (!id) return;
        selectDrug(id);
      });
    })(buttons[j]);
  }
}

function selectDrug(drugId) {
  selectedDrugId = drugId;

  // Highlight the selected button in the list
  var container = document.getElementById("drug-list");
  if (container) {
    var buttons = container.querySelectorAll(".drug-list-item");
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      if (btn.getAttribute("data-drug-id") === drugId) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    }
  }

  renderDrugDetailById(drugId);
}

function renderDrugDetailById(drugId) {
  var drug = null;
  for (var i = 0; i < drugsList.length; i++) {
    if (drugsList[i].id === drugId) {
      drug = drugsList[i];
      break;
    }
  }
  if (!drug) {
    console.warn("Drug not found:", drugId);
    return;
  }
  renderDrugDetail(drug);
}

function renderDrugDetail(drug) {
  var container = document.getElementById("drug-detail-content");
  if (!container) return;

  var name = drug.name || "";
  var klass = drug["class"] || "";
  var summary = drug.summary || "";
  var indications = drug.indications || [];
  var sideEffects = drug.sideEffects || [];
  var cautions = drug.cautions || [];
  var compatibility = drug.compatibility || {};
  var standardDose = drug.standardDose || "See institutional guidelines.";

  var html = "";
  html += '<div class="drug-card">';
  html += '  <h3 class="drug-name">' + escapeHtml(name) + "</h3>";
  html += '  <p class="drug-class">' + escapeHtml(klass) + "</p>";

  html += '  <section class="drug-section">';
  html += "    <h4>Summary</h4>";
  html += "    <p>" + escapeHtml(summary) + "</p>";
  html += "  </section>";

  html += '  <section class="drug-section">';
  html += "    <h4>Indications</h4>";
  if (indications.length) {
    html += "    <ul>";
    for (var i = 0; i < indications.length; i++) {
      html += "      <li>" + escapeHtml(indications[i]) + "</li>";
    }
    html += "    </ul>";
  } else {
    html += '    <p class="muted">No indications listed.</p>';
  }
  html += "  </section>";

  html += '  <section class="drug-section">';
  html += "    <h4>Side Effects</h4>";
  if (sideEffects.length) {
    html += "    <ul>";
    for (var j = 0; j < sideEffects.length; j++) {
      html += "      <li>" + escapeHtml(sideEffects[j]) + "</li>";
    }
    html += "    </ul>";
  } else {
    html += '    <p class="muted">No side effects listed.</p>';
  }
  html += "  </section>";

  html += '  <section class="drug-section">';
  html += "    <h4>Cautions</h4>";
  if (cautions.length) {
    html += "    <ul>";
    for (var k = 0; k < cautions.length; k++) {
      html += "      <li>" + escapeHtml(cautions[k]) + "</li>";
    }
    html += "    </ul>";
  } else {
    html += '    <p class="muted">No cautions listed.</p>';
  }
  html += "  </section>";

  html += '  <section class="drug-section">';
  html += "    <h4>Compatibility</h4>";
  html += "    <ul>";
  if (compatibility.iv) {
    html +=
      "      <li><strong>IV:</strong> " + escapeHtml(compatibility.iv) + "</li>";
  }
  if (compatibility.oral) {
    html +=
      "      <li><strong>Oral:</strong> " + escapeHtml(compatibility.oral) + "</li>";
  }
  if (compatibility.other) {
    html +=
      "      <li><strong>Other:</strong> " + escapeHtml(compatibility.other) + "</li>";
  }
  html += "    </ul>";
  html += "  </section>";

  html += '  <section class="drug-section">';
  html += "    <h4>Dosing (Educational Only)</h4>";
  html +=
    "    <p><strong>Standard order example:</strong> " +
    escapeHtml(standardDose) +
    "</p>";
  html +=
    '    <p class="muted">This information is for simulation and teaching only. Real prescribing must follow institutional protocols.</p>';
  html += "  </section>";

  html += "</div>";

  container.innerHTML = html;
}

