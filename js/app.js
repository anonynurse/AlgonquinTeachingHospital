// js/app.js  — minimal stable version

/************ SIMPLE AUTH ************/

const USERS = {
  admin: { password: "password", role: "admin" },
  sn001: { password: "password", role: "student" },
  sn002: { password: "password", role: "student" },
  sn003: { password: "password", role: "student" },
  sn004: { password: "password", role: "student" }
};

let currentUser = null;              // { username, role }

/************ APP STATE ************/

let patientsData = [];               // from patients.csv
const patientCharts = new Map();     // patientNumber -> basic chart
const openPatientTabs = new Map();   // patientNumber -> tab element

let drugsList = [];                  // from data/drugs/drugs.json
const drugDetails = new Map();       // id -> drug JSON
const openDrugTabs = new Map();      // id -> tab element

/************ UTIL ************/

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/************ ENTRY ************/

document.addEventListener("DOMContentLoaded", function () {
  setupLogin();
  setupNav();
  loadPatients();
  loadDrugs();
});

/************ LOGIN + NAV ************/

function setupLogin() {
  var form = document.getElementById("login-form");
  if (!form) return;

  var errorEl = document.getElementById("login-error");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (errorEl) errorEl.textContent = "";

    // Try to get username/password robustly
    var usernameInput =
      form.querySelector("input[name='username']") ||
      document.getElementById("username");
    var passwordInput =
      form.querySelector("input[name='password']") ||
      document.getElementById("password");

    var username = usernameInput ? usernameInput.value.trim() : "";
    var password = passwordInput ? passwordInput.value : "";

    var user = tryLogin(username, password);
    if (!user) {
      if (errorEl) errorEl.textContent = "Invalid username or password.";
      return;
    }

    currentUser = user;
    form.reset();
    showMainApp();
  });
}

function tryLogin(username, password) {
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

      // Reset patient tabs
      var ptTabBar = document.getElementById("patient-tab-bar");
      if (ptTabBar) ptTabBar.innerHTML = "";
      openPatientTabs.clear();
      patientCharts.clear();

      // Reset drug tabs
      var drugTabBar = document.getElementById("drug-tab-bar");
      if (drugTabBar) drugTabBar.innerHTML = "";
      openDrugTabs.clear();
      var drugDetail = document.getElementById("drug-detail-content");
      if (drugDetail) {
        drugDetail.innerHTML =
          '<p class="muted">Select a drug from the list on the left.</p>';
      }

      // Back to login
      showLoginScreen();
      refreshBrainAssignedList();
    });
  }

  var navTabs = document.querySelectorAll(".nav-tab");
  for (var i = 0; i < navTabs.length; i++) {
    (function (tab) {
      tab.addEventListener("click", function () {
        // highlight tab
        for (var j = 0; j < navTabs.length; j++) {
          navTabs[j].classList.remove("active");
        }
        tab.classList.add("active");

        var viewName = tab.getAttribute("data-view");
        setActiveView(viewName);
      });
    })(navTabs[i]);
  }
}

function showMainApp() {
  var loginScreen = document.getElementById("login-screen");
  var mainApp = document.getElementById("main-app");
  var usernameDisplay = document.getElementById("nav-username");

  if (loginScreen) loginScreen.classList.remove("active");
  if (mainApp) mainApp.classList.add("active");
  if (usernameDisplay && currentUser) {
    usernameDisplay.textContent = currentUser.username;
  }

  setActiveView("brain");
  setActiveTab("brain");
  refreshBrainAssignedList();
}

function showLoginScreen() {
  var loginScreen = document.getElementById("login-screen");
  var mainApp = document.getElementById("main-app");
  if (mainApp) mainApp.classList.remove("active");
  if (loginScreen) loginScreen.classList.add("active");
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

/************ PATIENT LIST ************/

function loadPatients() {
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
      console.error("Error loading patients.csv:", err);
    });
}

function parsePatientsCsv(text) {
  var lines = text.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  var dataLines = lines.slice(1); // skip header

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

/************ PATIENT TABS ************/

function openPatientTab(patientNumber) {
  var patient = null;
  for (var i = 0; i < patientsData.length; i++) {
    if (patientsData[i].patientNumber === patientNumber) {
      patient = patientsData[i];
      break;
    }
  }
  if (!patient) return;

  var tabBar = document.getElementById("patient-tab-bar");
  if (!tabBar) return;

  if (!openPatientTabs.has(patientNumber)) {
    var tabEl = document.createElement("button");
    tabEl.className = "patient-tab";
    tabEl.setAttribute("data-patient-number", patientNumber);
    tabEl.innerHTML =
      '<span class="patient-tab-label">' +
      escapeHtml(patient.lastName) + ", " + escapeHtml(patient.firstName) +
      '</span>' +
      '<span class="tab-close" aria-label="Close tab">&times;</span>';

    tabEl.addEventListener("click", function (e) {
      if (e.target && e.target.classList.contains("tab-close")) {
        e.stopPropagation();
        closePatientTab(patientNumber);
      } else {
        activatePatientTab(patientNumber);
      }
    });

    tabBar.appendChild(tabEl);
    openPatientTabs.set(patientNumber, tabEl);
  }
  // Do not auto-switch; user must click tab to view
}

function activatePatientTab(patientNumber) {
  openPatientTabs.forEach(function (el, id) {
    if (id === patientNumber) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });

  loadAndRenderPatientChart(patientNumber);
}

function closePatientTab(patientNumber) {
  var tabEl = openPatientTabs.get(patientNumber);
  if (!tabEl) return;

  var isActive = tabEl.classList.contains("active");
  tabEl.remove();
  openPatientTabs.delete(patientNumber);

  if (isActive) {
    var remaining = Array.from(openPatientTabs.keys());
    if (remaining.length > 0) {
      var lastId = remaining[remaining.length - 1];
      activatePatientTab(lastId);
    } else {
      setActiveTab("patient-list");
      setActiveView("patient-list");
    }
  }
}

/************ PATIENT CHART + BRAIN (SIMPLE) ************/

function loadAndRenderPatientChart(patientNumber) {
  var summaryRow = null;
  for (var i = 0; i < patientsData.length; i++) {
    if (patientsData[i].patientNumber === patientNumber) {
      summaryRow = patientsData[i];
      break;
    }
  }
  if (!summaryRow) return;

  var chart = patientCharts.get(patientNumber);
  if (!chart) {
    chart = {
      patientNumber: summaryRow.patientNumber,
      demographics: {
        firstName: summaryRow.firstName,
        lastName: summaryRow.lastName,
        gender: summaryRow.gender,
        dateOfBirth: summaryRow.dob,
        age: summaryRow.age,
        weightKg: summaryRow.weight,
        allergies: summaryRow.allergies || "No Known Allergies",
        unit: "",
        room: "",
        precautions: "None documented"
      },
      assignedNurses: []
    };
    patientCharts.set(patientNumber, chart);
  }

  renderPatientDetail(chart);
  setActiveView("patient-detail");
  refreshBrainAssignedList();
}

function renderPatientDetail(chart) {
  var container = document.getElementById("patient-detail-content");
  if (!container) return;

  var d = chart.demographics || {};
  var isAssigned =
    currentUser &&
    chart.assignedNurses &&
    chart.assignedNurses.indexOf(currentUser.username) !== -1;

  var html = "";

  // Banner
  html += '<section class="patient-banner">';
  html += '  <div class="patient-banner-main">';
  html += '    <div class="patient-name-line">' +
    escapeHtml((d.lastName || "").toUpperCase()) + ", " +
    escapeHtml(d.firstName || "") + "</div>";
  html += '    <div class="patient-banner-row">';
  html += '      <span>Patient # ' + escapeHtml(chart.patientNumber || "") + "</span>";
  if (d.age != null && d.age !== "") {
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

  // Simple placeholder for chart tabs
  html += '<div class="chart-subnav">';
  html += '  <button class="chart-tab active" data-chart-view="summary">Summary</button>';
  html += '  <button class="chart-tab" data-chart-view="orders">Orders</button>';
  html += '  <button class="chart-tab" data-chart-view="flowsheet">Flowsheet</button>';
  html += '  <button class="chart-tab" data-chart-view="mar">MAR</button>';
  html += "</div>";

  html += '<div id="patient-chart-views">';
  html += '  <div id="chart-summary" class="chart-view active">';
  html += '    <p class="muted">Summary view placeholder.</p>';
  html += "  </div>";
  html += '  <div id="chart-orders" class="chart-view">';
  html += '    <p class="muted">Orders view coming later.</p>';
  html += "  </div>";
  html += '  <div id="chart-flowsheet" class="chart-view">';
  html += '    <p class="muted">Flowsheet view coming later.</p>';
  html += "  </div>";
  html += '  <div id="chart-mar" class="chart-view">';
  html += '    <p class="muted">MAR view coming later.</p>';
  html += "  </div>";
  html += "</div>";

  container.innerHTML = html;

  var assignBtn = document.getElementById("assign-btn");
  if (assignBtn && currentUser) {
    assignBtn.addEventListener("click", function () {
      toggleAssignment(chart.patientNumber);
    });
  }

  // internal chart tab switching
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
        var target = container.querySelector("#chart-" + view);
        if (target) target.classList.add("active");
      });
    })(chartTabs[i]);
  }
}

function toggleAssignment(patientNumber) {
  if (!currentUser) return;
  var chart = patientCharts.get(patientNumber);
  if (!chart) return;

  if (!chart.assignedNurses) chart.assignedNurses = [];
  var idx = chart.assignedNurses.indexOf(currentUser.username);
  if (idx === -1) {
    chart.assignedNurses.push(currentUser.username);
  } else {
    chart.assignedNurses.splice(idx, 1);
  }
  patientCharts.set(patientNumber, chart);
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
  patientCharts.forEach(function (chart) {
    if (
      chart.assignedNurses &&
      chart.assignedNurses.indexOf(currentUser.username) !== -1
    ) {
      var d = chart.demographics || {};
      var name =
        escapeHtml((d.lastName || "").toUpperCase()) +
        ", " + escapeHtml(d.firstName || "");
      rows +=
        '<tr data-patient-number="' + escapeHtml(chart.patientNumber) + '">' +
        "<td>" + escapeHtml(chart.patientNumber) + "</td>" +
        "<td>" + name + "</td>" +
        "<td>" + escapeHtml(d.unit || "") + "</td>" +
        "<td>" + escapeHtml(d.room || "") + "</td>" +
        "</tr>";
    }
  });

  if (!rows) {
    container.innerHTML =
      '<p class="muted">You are not currently assigned to any patients.</p>';
    return;
  }

  var html = "";
  html += '<div class="table-wrapper">';
  html += '  <table class="patient-table">';
  html += "    <thead>";
  html += "      <tr>";
  html += "        <th>Patient #</th>";
  html += "        <th>Name</th>";
  html += "        <th>Unit</th>";
  html += "        <th>Room</th>";
  html += "      </tr>";
  html += "    </thead>";
  html += "    <tbody>";
  html += rows;
  html += "    </tbody>";
  html += "  </table>";
  html += "</div>";

  container.innerHTML = html;

  var trs = container.querySelectorAll("tbody tr");
  for (var i = 0; i < trs.length; i++) {
    (function (tr) {
      var pn = tr.getAttribute("data-patient-number");
      tr.addEventListener("click", function () {
        if (!pn) return;
        openPatientTab(pn);
        activatePatientTab(pn);
      });
    })(trs[i]);
  }
}

/************ DRUG MANUAL (SIMPLE) ************/

function loadDrugs() {
  fetch("data/drugs/drugs.json")
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      if (!Array.isArray(data)) data = [];
      data.sort(function (a, b) {
        return (a.name || "").localeCompare(b.name || "");
      });
      drugsList = data;
      renderDrugList();
    })
    .catch(function (err) {
      // If file doesn't exist, just log and don't break anything
      console.warn("Error loading drugs.json:", err);
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
      var id = btn.getAttribute("data-drug-id");
      btn.addEventListener("click", function () {
        if (!id) return;
        openDrugTab(id);
        activateDrugTab(id);
      });
    })(buttons[j]);
  }
}

function openDrugTab(drugId) {
  var drug = null;
  for (var i = 0; i < drugsList.length; i++) {
    if (drugsList[i].id === drugId) {
      drug = drugsList[i];
      break;
    }
  }
  if (!drug) return;

  var tabBar = document.getElementById("drug-tab-bar");
  if (!tabBar) return;

  if (!openDrugTabs.has(drugId)) {
    var tabEl = document.createElement("button");
    tabEl.className = "drug-tab";
    tabEl.setAttribute("data-drug-id", drugId);
    tabEl.innerHTML =
      '<span class="drug-tab-label">' + escapeHtml(drug.name) + "</span>" +
      '<span class="drug-tab-close" aria-label="Close tab">&times;</span>';

    tabEl.addEventListener("click", function (e) {
      if (e.target && e.target.classList.contains("drug-tab-close")) {
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
  openDrugTabs.forEach(function (el, id) {
    if (id === drugId) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });
  loadAndRenderDrug(drugId);
}

function closeDrugTab(drugId) {
  var tabEl = openDrugTabs.get(drugId);
  if (!tabEl) return;

  var isActive = tabEl.classList.contains("active");
  tabEl.remove();
  openDrugTabs.delete(drugId);

  var detail = document.getElementById("drug-detail-content");
  if (!detail) return;

  if (isActive) {
    var remaining = Array.from(openDrugTabs.keys());
    if (remaining.length > 0) {
      var last = remaining[remaining.length - 1];
      activateDrugTab(last);
    } else {
      detail.innerHTML =
        '<p class="muted">Select a drug from the list on the left.</p>';
    }
  }
}

function loadAndRenderDrug(drugId) {
  var cached = drugDetails.get(drugId);
  if (cached) {
    renderDrugDetail(cached);
    return;
  }

  fetch("data/drugs/" + drugId + ".json")
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (json) {
      drugDetails.set(drugId, json);
      renderDrugDetail(json);
    })
    .catch(function (err) {
      console.error("Error loading drug file:", err);
    });
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
    html += "      <li><strong>IV:</strong> " + escapeHtml(compatibility.iv) + "</li>";
  }
  if (compatibility.oral) {
    html += "      <li><strong>Oral:</strong> " + escapeHtml(compatibility.oral) + "</li>";
  }
  if (compatibility.other) {
    html += "      <li><strong>Other:</strong> " + escapeHtml(compatibility.other) + "</li>";
  }
  html += "    </ul>";
  html += "  </section>";

  html += '  <section class="drug-section">';
  html += "    <h4>Dosing (Educational Only)</h4>";
  html += "    <p><strong>Standard order example:</strong> " +
    escapeHtml(standardDose) + "</p>";
  html += '    <p class="muted">Exact mg/kg dosing should be filled from a trusted reference when you build scenarios.</p>';
  html += "  </section>";

  html += "</div>";

  container.innerHTML = html;
}
