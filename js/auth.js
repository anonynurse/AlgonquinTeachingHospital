// js/auth.js

const STORAGE_KEY = "adh_current_user";

// Hard-coded users for now.
// All use password: "password"
const USERS = [
  {
    username: "admin",
    password: "password",
    role: "admin",
  },
  {
    username: "sn001",
    password: "password",
    role: "student",
  },
  {
    username: "sn002",
    password: "password",
    role: "student",
  },
  {
    username: "sn003",
    password: "password",
    role: "student",
  },
  {
    username: "sn004",
    password: "password",
    role: "student",
  },
];

export const Auth = {
  init() {
    // Placeholder for future logic if needed
  },

  /**
   * Attempt login with username/password.
   * Returns a user object { username, role } on success, or null on failure.
   */
  login(username, password) {
    const user = USERS.find(
      (u) => u.username === username && u.password === password
    );
    if (!user) {
      return null;
    }

    // Don't store password in localStorage
    const { password: _pw, ...safeUser } = user;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safeUser));
    } catch (e) {
      console.warn("Could not store user in localStorage", e);
    }
    return safeUser;
  },

  /**
   * Remove current user from localStorage.
   */
  logout() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn("Could not remove user from localStorage", e);
    }
  },

  /**
   * Get the currently logged in user from localStorage, or null.
   */
  getCurrentUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn("Could not parse stored user", e);
      return null;
    }
  },
};
