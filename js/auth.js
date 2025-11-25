// js/auth.js

const USERS_KEY = "adh_users";
const CURRENT_USER_KEY = "adh_current_user";

export const Auth = {
  /**
   * Initialize default users if none exist.
   */
  init() {
    const existing = localStorage.getItem(USERS_KEY);
    if (!existing) {
      const defaultUsers = [
        {
          username: "admin",
          password: "password", // NOTE: plain text, fine for training only
          role: "admin"
        }
      ];
      localStorage.setItem(USERS_KEY, JSON.stringify(defaultUsers));
    }
  },

  /**
   * Attempt login; returns user object or null.
   */
  login(username, password) {
    const users = this._getUsers();
    const user = users.find(
      (u) => u.username === username && u.password === password
    );

    if (!user) return null;

    // Store current user session
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    return user;
  },

  /**
   * Log out current user.
   */
  logout() {
    localStorage.removeItem(CURRENT_USER_KEY);
  },

  /**
   * Get currently logged-in user (or null).
   */
  getCurrentUser() {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  /**
   * (For future admin UI) Add a new user.
   */
  addUser(newUser) {
    const users = this._getUsers();
    // Basic check: no duplicate username
    if (users.some((u) => u.username === newUser.username)) {
      throw new Error("Username already exists.");
    }
    users.push(newUser);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  },

  _getUsers() {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
};
