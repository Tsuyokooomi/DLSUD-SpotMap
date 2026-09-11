// ---------- State & Variables ----------

let places = []; // dynamic list of places from backend (or fallback)
let allTags = [];
let activeCategory = "all";
let activeTags = new Set(); // tags currently applied as a filter
let pendingTags = new Set(); // tags checked in the panel, before "Apply"
let markers = {}; // id -> leaflet marker
let currentCard = null;
let currentPlace = null;
let authMode = "login"; // "login" | "signup"

// ---------- Map Setup ----------

const map = L.map("map", { zoomControl: false }).setView([14.3294, 120.9367], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

L.control.zoom({ position: "bottomright" }).addTo(map);

// Pin icon generator
function makeIcon(category) {
  return L.divIcon({
    className: "",
    html: `<div class="pin pin-${category}"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26]
  });
}

// ---------- Render Pins ----------

function renderPins() {
  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};

  const visible = places.filter(p => {
    const matchesCategory = activeCategory === "all" || p.category === activeCategory;
    const placeTags = p.tags || [];
    const matchesTags = activeTags.size === 0 || [...activeTags].every(t => placeTags.includes(t));
    return matchesCategory && matchesTags;
  });

  visible.forEach(place => {
    const placeId = place._id || place.id;
    const marker = L.marker([place.lat, place.lng], { icon: makeIcon(place.category) }).addTo(map);
    marker.on("click", () => openCard(place));
    markers[placeId] = marker;
  });

  const statusEl = document.getElementById("statusPill");
  if (statusEl) {
    statusEl.textContent = `${visible.length} place${visible.length === 1 ? "" : "s"} shown`;
  }
}

// ---------- Place Card Details ----------

function openCard(place) {
  closeCard();
  currentPlace = place;
  const placeId = place._id || place.id;

  const template = document.getElementById("placeCardTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.category = place.category;

  node.querySelector(".place-card-category").textContent = place.category;
  node.querySelector(".place-card-title").textContent = place.name;
  node.querySelector(".place-card-address").textContent = place.address;
  node.querySelector(".place-card-desc").textContent = place.description || "No description provided.";

  // Admin controls
  const adminControls = node.querySelector(".place-admin-controls");
  if (adminControls && State.isAdmin()) {
    adminControls.style.display = "flex";

    const editBtn = node.querySelector(".place-edit-btn");
    const deleteBtn = node.querySelector(".place-delete-btn");

    if (editBtn) {
      editBtn.addEventListener("click", () => openPlaceModal(place));
    }

    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        if (confirm(`Are you sure you want to delete "${place.name}"?`)) {
          try {
            await API.places.delete(placeId);
            closeCard();
            await loadPlaces();
          } catch (err) {
            alert(err.message || "Failed to delete place");
          }
        }
      });
    }
  }

  // Tags
  const tagWrap = node.querySelector(".place-card-tags");
  (place.tags || []).forEach(tag => {
    const span = document.createElement("span");
    span.className = "place-card-tag";
    span.textContent = tag;
    tagWrap.appendChild(span);
  });

  // Action buttons (Star / To-go)
  const starBtn = node.querySelector('[data-action="star"]');
  const togoBtn = node.querySelector('[data-action="togo"]');

  if (State.savedStarred.has(placeId)) starBtn.classList.add("active");
  if (State.savedTogo.has(placeId)) togoBtn.classList.add("active");

  starBtn.addEventListener("click", async () => {
    if (!State.isLoggedIn()) {
      openAuthModal("login", "Please log in to save places.");
      return;
    }
    const isStarred = State.savedStarred.has(placeId);
    try {
      if (isStarred) {
        await API.saved.remove(placeId, "star");
        State.savedStarred.delete(placeId);
        starBtn.classList.remove("active");
      } else {
        await API.saved.save(placeId, "star");
        State.savedStarred.add(placeId);
        starBtn.classList.add("active");
      }
    } catch (err) {
      console.error("Star toggle failed:", err);
    }
  });

  togoBtn.addEventListener("click", async () => {
    if (!State.isLoggedIn()) {
      openAuthModal("login", "Please log in to save places.");
      return;
    }
    const isTogo = State.savedTogo.has(placeId);
    try {
      if (isTogo) {
        await API.saved.remove(placeId, "togo");
        State.savedTogo.delete(placeId);
        togoBtn.classList.remove("active");
      } else {
        await API.saved.save(placeId, "togo");
        State.savedTogo.add(placeId);
        togoBtn.classList.add("active");
      }
    } catch (err) {
      console.error("Togo toggle failed:", err);
    }
  });

  node.querySelector(".place-card-close").addEventListener("click", closeCard);

  // Load and render comments from backend
  renderComments(node, placeId);

  // Comment submission
  const input = node.querySelector(".comment-input");
  const submit = node.querySelector(".comment-submit");

  async function handleAddComment() {
    const text = input.value.trim();
    if (!text) return;

    if (!State.isLoggedIn()) {
      openAuthModal("login", "Please log in to add notes.");
      return;
    }

    try {
      submit.disabled = true;
      await API.comments.create(placeId, text);
      input.value = "";
      renderComments(node, placeId);
    } catch (err) {
      alert(err.message || "Failed to post note");
    } finally {
      submit.disabled = false;
    }
  }

  submit.addEventListener("click", handleAddComment);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") handleAddComment();
  });

  document.body.appendChild(node);
  currentCard = node;

  map.panTo([place.lat, place.lng]);
}

async function renderComments(node, placeId) {
  const list = node.querySelector(".comment-list");
  list.innerHTML = `<div class="comment-item" style="color: var(--ink-soft);">Loading notes…</div>`;

  try {
    const comments = await API.comments.getByPlace(placeId);
    list.innerHTML = "";

    if (!Array.isArray(comments) || comments.length === 0) {
      list.innerHTML = `<div class="comment-item" style="color: var(--ink-soft);">No notes yet. Be the first to add one!</div>`;
      return;
    }

    const currentUser = State.getUser();

    comments.forEach(c => {
      const div = document.createElement("div");
      div.className = "comment-item";

      const authorEmail = (typeof c.user === "object" && c.user ? c.user.email : "Anonymous") || "User";
      const isOwner = currentUser && (
        (typeof c.user === "object" && c.user?._id === currentUser.id) ||
        (typeof c.user === "string" && c.user === currentUser.id) ||
        authorEmail === currentUser.email
      );

      div.innerHTML = `
        <div class="comment-item-header">
          <span class="comment-author">${authorEmail.split("@")[0]}</span>
          ${isOwner ? `<button class="comment-delete-btn" title="Delete note">×</button>` : ""}
        </div>
        <div class="comment-text">${escapeHtml(c.text)}</div>
      `;

      if (isOwner) {
        div.querySelector(".comment-delete-btn").addEventListener("click", async () => {
          if (confirm("Delete this note?")) {
            try {
              await API.comments.delete(c._id);
              renderComments(node, placeId);
            } catch (err) {
              alert(err.message || "Failed to delete note");
            }
          }
        });
      }

      list.appendChild(div);
    });
  } catch (err) {
    // If backend comments fail (or mock data is active)
    list.innerHTML = `<div class="comment-item" style="color: var(--ink-soft);">No notes available.</div>`;
  }
}

function closeCard() {
  if (currentCard) {
    currentCard.remove();
    currentCard = null;
    currentPlace = null;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------- Filter Categories ----------

document.getElementById("filters").addEventListener("click", e => {
  const chip = e.target.closest(".chip[data-category]");
  if (!chip) return;

  document.querySelectorAll(".chip[data-category]").forEach(c => c.classList.remove("chip-active"));
  chip.classList.add("chip-active");

  activeCategory = chip.dataset.category;
  closeCard();
  renderPins();
});

// ---------- Search ----------

const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");

function runSearch() {
  const query = searchInput.value.trim().toLowerCase();

  if (!query) {
    searchResults.classList.remove("open");
    searchResults.innerHTML = "";
    return;
  }

  const matches = places.filter(p => {
    const nameMatch = p.name.toLowerCase().includes(query);
    const tags = p.tags || [];
    const tagMatch = tags.some(t => t.toLowerCase().includes(query));
    return nameMatch || tagMatch;
  });

  searchResults.innerHTML = "";

  if (matches.length === 0) {
    searchResults.innerHTML = `<div class="search-empty">No places match "${query}".</div>`;
    searchResults.classList.add("open");
    return;
  }

  matches.forEach(place => {
    const item = document.createElement("div");
    item.className = "search-result-item";
    const tagsStr = (place.tags || []).join(", ");
    item.innerHTML = `
      <span class="chip-dot dot-${place.category}"></span>
      <div>
        <div class="search-result-name">${place.name}</div>
        <div class="search-result-meta">${place.category} · ${tagsStr}</div>
      </div>
    `;
    item.addEventListener("click", () => {
      map.panTo([place.lat, place.lng]);
      openCard(place);
      searchResults.classList.remove("open");
    });
    searchResults.appendChild(item);
  });

  searchResults.classList.add("open");
}

document.getElementById("searchBtn").addEventListener("click", runSearch);
searchInput.addEventListener("keydown", e => { if (e.key === "Enter") runSearch(); });

document.addEventListener("click", e => {
  if (!e.target.closest(".search-wrap")) {
    searchResults.classList.remove("open");
  }
});

// ---------- Tag Filter Panel ----------

function refreshAllTags() {
  allTags = [...new Set(places.flatMap(p => p.tags || []))].filter(Boolean).sort();
}

function renderTagFilterList() {
  const list = document.getElementById("tagFilterList");
  list.innerHTML = "";
  allTags.forEach(tag => {
    const label = document.createElement("label");
    label.className = "tag-filter-option";
    const checked = pendingTags.has(tag) ? "checked" : "";
    label.innerHTML = `<input type="checkbox" value="${tag}" ${checked}> ${tag}`;
    label.querySelector("input").addEventListener("change", e => {
      if (e.target.checked) pendingTags.add(tag);
      else pendingTags.delete(tag);
    });
    list.appendChild(label);
  });
}

function updateTagFilterCount() {
  const countEl = document.getElementById("tagFilterCount");
  countEl.textContent = activeTags.size > 0 ? `(${activeTags.size})` : "";
}

const tagFilterBtn = document.getElementById("tagFilterBtn");
const tagFilterPanel = document.getElementById("tagFilterPanel");

tagFilterBtn.addEventListener("click", () => {
  pendingTags = new Set(activeTags);
  renderTagFilterList();

  const rect = tagFilterBtn.getBoundingClientRect();
  tagFilterPanel.style.top = `${rect.bottom + 8}px`;
  tagFilterPanel.style.left = `${rect.left}px`;

  tagFilterPanel.classList.toggle("open");
});

document.getElementById("tagFilterApply").addEventListener("click", () => {
  activeTags = new Set(pendingTags);
  updateTagFilterCount();
  tagFilterPanel.classList.remove("open");

  if (activeTags.size > 0 && activeCategory !== "all") {
    activeCategory = "all";
    document.querySelectorAll(".chip[data-category]").forEach(c => c.classList.remove("chip-active"));
    document.querySelector('.chip[data-category="all"]').classList.add("chip-active");
  }

  closeCard();
  renderPins();
});

document.getElementById("tagFilterClear").addEventListener("click", () => {
  pendingTags.clear();
  activeTags.clear();
  updateTagFilterCount();
  renderTagFilterList();
  closeCard();
  renderPins();
});

document.addEventListener("click", e => {
  if (!e.target.closest(".tag-filter-wrap")) {
    tagFilterPanel.classList.remove("open");
  }
});

// ---------- Auth Modal & Topbar UI ----------

const authModal = document.getElementById("authModal");
const authForm = document.getElementById("authForm");
const authError = document.getElementById("authError");
const tabLogin = document.getElementById("tabLogin");
const tabSignup = document.getElementById("tabSignup");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");

function updateAuthUI() {
  const loggedIn = State.isLoggedIn();
  const user = State.getUser();
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const adminBtn = document.getElementById("adminBtn");
  const userProfile = document.getElementById("userProfile");
  const userEmailBadge = document.getElementById("userEmailBadge");

  if (loggedIn && user) {
    if (loginBtn) loginBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "block";
    if (userProfile) {
      userProfile.style.display = "flex";
      userEmailBadge.innerHTML = `${user.email} ${user.role === "admin" ? '<span class="user-role-badge">ADMIN</span>' : ""}`;
    }
    if (adminBtn) {
      adminBtn.style.display = user.role === "admin" ? "block" : "none";
    }
  } else {
    if (loginBtn) loginBtn.style.display = "block";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (userProfile) userProfile.style.display = "none";
    if (adminBtn) adminBtn.style.display = "none";
  }
}

function openAuthModal(mode = "login", errorMsg = "") {
  authMode = mode;
  if (mode === "login") {
    tabLogin.classList.add("active");
    tabSignup.classList.remove("active");
    authSubmitBtn.textContent = "Log In";
  } else {
    tabSignup.classList.add("active");
    tabLogin.classList.remove("active");
    authSubmitBtn.textContent = "Sign Up";
  }

  authEmail.value = "";
  authPassword.value = "";

  if (errorMsg) {
    authError.textContent = errorMsg;
    authError.style.display = "block";
  } else {
    authError.style.display = "none";
  }

  authModal.style.display = "flex";
  authEmail.focus();
}

function closeAuthModal() {
  authModal.style.display = "none";
}

tabLogin.addEventListener("click", () => openAuthModal("login"));
tabSignup.addEventListener("click", () => openAuthModal("signup"));
document.getElementById("authCloseBtn").addEventListener("click", closeAuthModal);
document.getElementById("loginBtn").addEventListener("click", () => openAuthModal("login"));

document.getElementById("logoutBtn").addEventListener("click", () => {
  State.clearSession();
  updateAuthUI();
  if (currentCard && currentPlace) {
    openCard(currentPlace);
  }
});

authForm.addEventListener("submit", async e => {
  e.preventDefault();
  authError.style.display = "none";

  const email = authEmail.value.trim();
  const password = authPassword.value;

  try {
    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = "Please wait...";

    let res;
    if (authMode === "signup") {
      res = await API.auth.signup(email, password);
    } else {
      res = await API.auth.login(email, password);
    }

    State.setSession(res.token, res.user);
    closeAuthModal();
    updateAuthUI();
    await State.refreshSaved();

    if (currentCard && currentPlace) {
      openCard(currentPlace);
    }
  } catch (err) {
    authError.textContent = err.message || "Authentication failed.";
    authError.style.display = "block";
  } finally {
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = authMode === "signup" ? "Sign Up" : "Log In";
  }
});

// ---------- Admin Modal (Add / Edit Spot) & Location Picker ----------

let adminPickerMarker = null;
let isPickingOnMap = false;

const placeModal = document.getElementById("placeModal");
const placeForm = document.getElementById("placeForm");
const placeModalTitle = document.getElementById("placeModalTitle");
const placeIdInput = document.getElementById("placeIdInput");
const placeNameInput = document.getElementById("placeNameInput");
const placeCategorySelect = document.getElementById("placeCategorySelect");
const placeTagsInput = document.getElementById("placeTagsInput");
const placeLatInput = document.getElementById("placeLatInput");
const placeLngInput = document.getElementById("placeLngInput");
const placeAddressInput = document.getElementById("placeAddressInput");
const placeDescInput = document.getElementById("placeDescInput");
const placeModalError = document.getElementById("placeModalError");
const placeSubmitBtn = document.getElementById("placeSubmitBtn");

const useCurrentLocationBtn = document.getElementById("useCurrentLocationBtn");
const pickOnMapBtn = document.getElementById("pickOnMapBtn");
const mapPickerBanner = document.getElementById("mapPickerBanner");
const pickerCoordsDisplay = document.getElementById("pickerCoordsDisplay");
const confirmLocationBtn = document.getElementById("confirmLocationBtn");
const cancelPickOnMapBtn = document.getElementById("cancelPickOnMapBtn");
const locationStatusBadge = document.getElementById("locationStatusBadge");
const locationStatusText = document.getElementById("locationStatusText");

function makeAdminPickerIcon() {
  return L.divIcon({
    className: "",
    html: `<div class="admin-draggable-pin" title="Drag to adjust position"></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });
}

function updateLocationUI(lat, lng, labelText) {
  placeLatInput.value = parseFloat(lat).toFixed(6);
  placeLngInput.value = parseFloat(lng).toFixed(6);
  locationStatusBadge.classList.add("has-location");
  locationStatusText.textContent = labelText || `Location set: ${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`;
  pickerCoordsDisplay.textContent = `Coordinates: ${parseFloat(lat).toFixed(6)}, ${parseFloat(lng).toFixed(6)}`;
}

function createOrUpdatePickerMarker(lat, lng) {
  if (!adminPickerMarker) {
    adminPickerMarker = L.marker([lat, lng], {
      draggable: true,
      icon: makeAdminPickerIcon(),
      zIndexOffset: 1000
    }).addTo(map);

    adminPickerMarker.on("drag", () => {
      const pos = adminPickerMarker.getLatLng();
      pickerCoordsDisplay.textContent = `Coordinates: ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
    });

    adminPickerMarker.on("dragend", () => {
      const pos = adminPickerMarker.getLatLng();
      updateLocationUI(pos.lat, pos.lng, `Pinned at ${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`);
    });
  } else {
    adminPickerMarker.setLatLng([lat, lng]);
  }
}

function removePickerMarker() {
  if (adminPickerMarker) {
    map.removeLayer(adminPickerMarker);
    adminPickerMarker = null;
  }
}

// "Use My Current Location" via browser GPS
useCurrentLocationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser.");
    return;
  }

  useCurrentLocationBtn.disabled = true;
  useCurrentLocationBtn.innerHTML = `<span>⏳</span> Locating…`;

  navigator.geolocation.getCurrentPosition(
    position => {
      useCurrentLocationBtn.disabled = false;
      useCurrentLocationBtn.innerHTML = `<span>📍</span> Use My Current Location`;
      const { latitude, longitude } = position.coords;

      updateLocationUI(latitude, longitude, `GPS Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);
      createOrUpdatePickerMarker(latitude, longitude);
      map.setView([latitude, longitude], 16);
    },
    err => {
      useCurrentLocationBtn.disabled = false;
      useCurrentLocationBtn.innerHTML = `<span>📍</span> Use My Current Location`;
      alert("Could not get your location. Please choose 'Drag Pin on Map' instead.");
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

// "Drag Pin on Map" mode
pickOnMapBtn.addEventListener("click", () => {
  isPickingOnMap = true;
  placeModal.style.display = "none";
  mapPickerBanner.style.display = "block";

  // Use existing coords or center of the map
  let lat = parseFloat(placeLatInput.value);
  let lng = parseFloat(placeLngInput.value);

  if (isNaN(lat) || isNaN(lng)) {
    const center = map.getCenter();
    lat = center.lat;
    lng = center.lng;
  }

  updateLocationUI(lat, lng, `Pinned at ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
  createOrUpdatePickerMarker(lat, lng);
  map.panTo([lat, lng]);
});

// Click on map while in picking mode moves the draggable pin
map.on("click", e => {
  if (isPickingOnMap) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    updateLocationUI(lat, lng, `Pinned at ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    createOrUpdatePickerMarker(lat, lng);
  }
});

// Confirm location from floating banner
confirmLocationBtn.addEventListener("click", () => {
  if (adminPickerMarker) {
    const pos = adminPickerMarker.getLatLng();
    updateLocationUI(pos.lat, pos.lng, `Pinned at ${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`);
  }
  isPickingOnMap = false;
  mapPickerBanner.style.display = "none";
  placeModal.style.display = "flex";
});

// Cancel picking on map
cancelPickOnMapBtn.addEventListener("click", () => {
  isPickingOnMap = false;
  mapPickerBanner.style.display = "none";
  placeModal.style.display = "flex";
  if (!placeLatInput.value || !placeLngInput.value) {
    removePickerMarker();
  }
});

function openPlaceModal(editPlace = null) {
  if (!State.isAdmin()) {
    alert("Admin access required.");
    return;
  }

  placeModalError.style.display = "none";

  if (editPlace) {
    placeModalTitle.textContent = "Edit Spot";
    placeIdInput.value = editPlace._id || editPlace.id;
    placeNameInput.value = editPlace.name;
    placeCategorySelect.value = editPlace.category;
    placeTagsInput.value = (editPlace.tags || []).join(", ");
    placeAddressInput.value = editPlace.address;
    placeDescInput.value = editPlace.description || "";
    placeSubmitBtn.textContent = "Update Spot";

    updateLocationUI(editPlace.lat, editPlace.lng, `Spot Location (${parseFloat(editPlace.lat).toFixed(4)}, ${parseFloat(editPlace.lng).toFixed(4)})`);
    createOrUpdatePickerMarker(editPlace.lat, editPlace.lng);
  } else {
    placeModalTitle.textContent = "Add New Spot";
    placeIdInput.value = "";
    placeNameInput.value = "";
    placeCategorySelect.value = "food";
    placeTagsInput.value = "";
    placeLatInput.value = "";
    placeLngInput.value = "";
    placeAddressInput.value = "";
    placeDescInput.value = "";
    placeSubmitBtn.textContent = "Save Spot";

    locationStatusBadge.classList.remove("has-location");
    locationStatusText.textContent = "No location selected (use buttons below)";
    removePickerMarker();
  }

  placeModal.style.display = "flex";
}

function closePlaceModal() {
  placeModal.style.display = "none";
  mapPickerBanner.style.display = "none";
  isPickingOnMap = false;
  removePickerMarker();
}

document.getElementById("adminBtn").addEventListener("click", () => openPlaceModal());
document.getElementById("placeModalCloseBtn").addEventListener("click", closePlaceModal);

placeForm.addEventListener("submit", async e => {
  e.preventDefault();
  placeModalError.style.display = "none";

  const id = placeIdInput.value;
  const name = placeNameInput.value.trim();
  const category = placeCategorySelect.value;
  const tags = placeTagsInput.value
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);
  const lat = parseFloat(placeLatInput.value);
  const lng = parseFloat(placeLngInput.value);
  const address = placeAddressInput.value.trim();
  const description = placeDescInput.value.trim();

  if (isNaN(lat) || isNaN(lng)) {
    placeModalError.textContent = "Please set a location using 'Use My Current Location' or 'Drag Pin on Map'.";
    placeModalError.style.display = "block";
    return;
  }

  const payload = { name, category, tags, lat, lng, address, description };

  try {
    placeSubmitBtn.disabled = true;
    placeSubmitBtn.textContent = "Saving...";

    let savedPlace;
    if (id) {
      savedPlace = await API.places.update(id, payload);
    } else {
      savedPlace = await API.places.create(payload);
    }

    closePlaceModal();
    await loadPlaces();

    if (savedPlace) {
      const found = places.find(p => (p._id || p.id) === (savedPlace._id || savedPlace.id));
      if (found) {
        map.panTo([found.lat, found.lng]);
        openCard(found);
      }
    }
  } catch (err) {
    placeModalError.textContent = err.message || "Failed to save place.";
    placeModalError.style.display = "block";
  } finally {
    placeSubmitBtn.disabled = false;
    placeSubmitBtn.textContent = id ? "Update Spot" : "Save Spot";
  }
});

// Close modals when clicking outside card
window.addEventListener("click", e => {
  if (e.target === authModal) closeAuthModal();
  if (e.target === placeModal) closePlaceModal();
});

// ---------- Data Initialization ----------

async function loadPlaces() {
  const statusEl = document.getElementById("statusPill");
  if (statusEl) statusEl.textContent = "Loading places…";

  try {
    const data = await API.places.getAll();
    if (Array.isArray(data) && data.length > 0) {
      places = data;
    } else if (Array.isArray(data) && data.length === 0 && typeof PLACES !== "undefined") {
      // Database has no records yet — fallback to mock places so the map is never empty
      places = PLACES;
    } else if (typeof PLACES !== "undefined") {
      places = PLACES;
    }
  } catch (err) {
    console.warn("Backend unavailable, loading local fallback data:", err.message);
    if (typeof PLACES !== "undefined") {
      places = PLACES;
    }
  }

  refreshAllTags();
  renderPins();
}

async function init() {
  updateAuthUI();
  await State.refreshSaved();
  await loadPlaces();
}

init();
