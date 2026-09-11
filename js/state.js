// ---------- Authentication & User State ----------

const AUTH_STORAGE_KEY = "spotmap_auth";

const State = {
  getToken() {
    return localStorage.getItem(`${AUTH_STORAGE_KEY}_token`);
  },

  getUser() {
    const raw = localStorage.getItem(`${AUTH_STORAGE_KEY}_user`);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  isLoggedIn() {
    return Boolean(this.getToken());
  },

  isAdmin() {
    const user = this.getUser();
    return Boolean(user && user.role === "admin");
  },

  setSession(token, user) {
    if (token) {
      localStorage.setItem(`${AUTH_STORAGE_KEY}_token`, token);
    }
    if (user) {
      localStorage.setItem(`${AUTH_STORAGE_KEY}_user`, JSON.stringify(user));
    }
    window.dispatchEvent(new CustomEvent("spotmap:auth-change", { detail: { user } }));
  },

  clearSession() {
    localStorage.removeItem(`${AUTH_STORAGE_KEY}_token`);
    localStorage.removeItem(`${AUTH_STORAGE_KEY}_user`);
    this.savedStarred.clear();
    this.savedTogo.clear();
    window.dispatchEvent(new CustomEvent("spotmap:auth-change", { detail: { user: null } }));
  },

  authHeaders() {
    const token = this.getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  },

  // In-memory sets of place IDs saved by current user
  savedStarred: new Set(),
  savedTogo: new Set(),

  async refreshSaved() {
    if (!this.isLoggedIn()) {
      this.savedStarred.clear();
      this.savedTogo.clear();
      return;
    }
    try {
      const items = await API.saved.getAll();
      this.savedStarred.clear();
      this.savedTogo.clear();
      if (Array.isArray(items)) {
        items.forEach(item => {
          const placeId = typeof item.place === "object" ? item.place?._id : item.place;
          if (item.type === "star" && placeId) this.savedStarred.add(placeId);
          if (item.type === "togo" && placeId) this.savedTogo.add(placeId);
        });
      }
    } catch (err) {
      console.warn("Could not load saved places:", err);
    }
  }
};
