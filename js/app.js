// js/app.js
import { Auth } from "./auth.js";

document.addEventListener("DOMContentLoaded", () => {
  Auth.init();
  setupLogin();
  setupNav();
  restoreSessionIfExists();
});

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
      // Activate tab
      navTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      // Activate corresponding view
      const viewName = tab.dataset.view; // e.g. "brain"
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
