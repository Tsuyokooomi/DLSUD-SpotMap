// ---------- API Client for SpotMap ----------

const API = {
  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      ...State.authHeaders(),
      ...(options.headers || {})
    };

    const config = {
      ...options,
      headers
    };

    let response;
    try {
      response = await fetch(url, config);
    } catch (networkErr) {
      throw new Error(`Cannot connect to server. Please check your network or ensure the backend is running.`);
    }

    let data;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const message = (data && data.error) || (data && data.message) || response.statusText || "Request failed";
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  },

  auth: {
    signup(email, password) {
      return API.request("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
    },

    login(email, password) {
      return API.request("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
    }
  },

  places: {
    getAll() {
      return API.request("/places");
    },

    getById(id) {
      return API.request(`/places/${id}`);
    },

    create(placeData) {
      return API.request("/places", {
        method: "POST",
        body: JSON.stringify(placeData)
      });
    },

    update(id, placeData) {
      return API.request(`/places/${id}`, {
        method: "PUT",
        body: JSON.stringify(placeData)
      });
    },

    delete(id) {
      return API.request(`/places/${id}`, {
        method: "DELETE"
      });
    }
  },

  saved: {
    getAll() {
      return API.request("/saved");
    },

    save(placeId, type) {
      return API.request("/saved", {
        method: "POST",
        body: JSON.stringify({ placeId, type })
      });
    },

    remove(placeId, type) {
      return API.request(`/saved/${placeId}/${type}`, {
        method: "DELETE"
      });
    }
  },

  comments: {
    getByPlace(placeId) {
      return API.request(`/comments/${placeId}`);
    },

    create(placeId, text) {
      return API.request(`/comments/${placeId}`, {
        method: "POST",
        body: JSON.stringify({ text })
      });
    },

    delete(commentId) {
      return API.request(`/comments/${commentId}`, {
        method: "DELETE"
      });
    }
  }
};
