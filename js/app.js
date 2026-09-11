// ---------- State ----------

let activeCategory = "all";
let activeTags = new Set(); // tags currently applied as a filter
let pendingTags = new Set(); // tags checked in the panel, before "Apply"
let markers = {}; // id -> leaflet marker
let currentCard = null;

// ---------- Map setup ----------

const map = L.map("map", { zoomControl: false }).setView([14.3294, 120.9367], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

L.control.zoom({ position: "bottomright" }).addTo(map);

// ---------- Local storage helpers ----------
// Stand-ins for real per-account data until the backend and login exist.

function loadSet(key) {
  const raw = localStorage.getItem(key);
  return raw ? new Set(JSON.parse(raw)) : new Set();
}

function saveSet(key, set) {
  localStorage.setItem(key, JSON.stringify([...set]));
}

function loadComments() {
  const raw = localStorage.getItem(STORAGE_KEYS.comments);
  return raw ? JSON.parse(raw) : {};
}

function saveComments(obj) {
  localStorage.setItem(STORAGE_KEYS.comments, JSON.stringify(obj));
}

let starred = loadSet(STORAGE_KEYS.starred);
let togo = loadSet(STORAGE_KEYS.togo);
let comments = loadComments();

// ---------- Pin icon ----------

function makeIcon(category) {
  return L.divIcon({
    className: "",
    html: `<div class="pin pin-${category}"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26]
  });
}

// ---------- Render pins ----------

function renderPins() {
  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};

  const visible = PLACES.filter(p => {
    const matchesCategory = activeCategory === "all" || p.category === activeCategory;
    const matchesTags = activeTags.size === 0 || [...activeTags].every(t => p.tags.includes(t));
    return matchesCategory && matchesTags;
  });

  visible.forEach(place => {
    const marker = L.marker([place.lat, place.lng], { icon: makeIcon(place.category) }).addTo(map);
    marker.on("click", () => openCard(place));
    markers[place.id] = marker;
  });

  document.getElementById("statusPill").textContent =
    `${visible.length} place${visible.length === 1 ? "" : "s"} shown`;
}

// ---------- Place card ----------

function openCard(place) {
  closeCard();

  const template = document.getElementById("placeCardTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.category = place.category;

  node.querySelector(".place-card-category").textContent = place.category;
  node.querySelector(".place-card-title").textContent = place.name;
  node.querySelector(".place-card-address").textContent = place.address;
  node.querySelector(".place-card-desc").textContent = place.description;

  const tagWrap = node.querySelector(".place-card-tags");
  place.tags.forEach(tag => {
    const span = document.createElement("span");
    span.className = "place-card-tag";
    span.textContent = tag;
    tagWrap.appendChild(span);
  });

  const starBtn = node.querySelector('[data-action="star"]');
  const togoBtn = node.querySelector('[data-action="togo"]');

  if (starred.has(place.id)) starBtn.classList.add("active");
  if (togo.has(place.id)) togoBtn.classList.add("active");

  starBtn.addEventListener("click", () => {
    toggleInSet(starred, place.id, STORAGE_KEYS.starred);
    starBtn.classList.toggle("active");
  });

  togoBtn.addEventListener("click", () => {
    toggleInSet(togo, place.id, STORAGE_KEYS.togo);
    togoBtn.classList.toggle("active");
  });

  node.querySelector(".place-card-close").addEventListener("click", closeCard);

  renderComments(node, place.id);

  const input = node.querySelector(".comment-input");
  const submit = node.querySelector(".comment-submit");

  function addComment() {
    const text = input.value.trim();
    if (!text) return;
    if (!comments[place.id]) comments[place.id] = [];
    comments[place.id].push(text);
    saveComments(comments);
    input.value = "";
    renderComments(node, place.id);
  }

  submit.addEventListener("click", addComment);
  input.addEventListener("keydown", e => { if (e.key === "Enter") addComment(); });

  document.body.appendChild(node);
  currentCard = node;

  map.panTo([place.lat, place.lng]);
}

function renderComments(node, placeId) {
  const list = node.querySelector(".comment-list");
  list.innerHTML = "";
  const items = comments[placeId] || [];
  if (items.length === 0) {
    list.innerHTML = `<div class="comment-item" style="color: var(--ink-soft);">No notes yet.</div>`;
    return;
  }
  items.forEach(text => {
    const div = document.createElement("div");
    div.className = "comment-item";
    div.textContent = text;
    list.appendChild(div);
  });
}

function closeCard() {
  if (currentCard) {
    currentCard.remove();
    currentCard = null;
  }
}

function toggleInSet(set, id, storageKey) {
  if (set.has(id)) set.delete(id);
  else set.add(id);
  saveSet(storageKey, set);
}

// ---------- Filters ----------

document.getElementById("filters").addEventListener("click", e => {
  const chip = e.target.closest(".chip[data-category]");
  if (!chip) return;

  document.querySelectorAll(".chip[data-category]").forEach(c => c.classList.remove("chip-active"));
  chip.classList.add("chip-active");

  activeCategory = chip.dataset.category;
  closeCard();
  renderPins();
});

// ---------- Search (name or tag, results shown in a dropdown) ----------

const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");

function runSearch() {
  const query = searchInput.value.trim().toLowerCase();

  if (!query) {
    searchResults.classList.remove("open");
    searchResults.innerHTML = "";
    return;
  }

  const matches = PLACES.filter(p => {
    const nameMatch = p.name.toLowerCase().includes(query);
    const tagMatch = p.tags.some(t => t.toLowerCase().includes(query));
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
    item.innerHTML = `
      <span class="chip-dot dot-${place.category}"></span>
      <div>
        <div class="search-result-name">${place.name}</div>
        <div class="search-result-meta">${place.category} · ${place.tags.join(", ")}</div>
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

// ---------- Tag filter panel ----------

const allTags = [...new Set(PLACES.flatMap(p => p.tags))].sort();

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

// ---------- Placeholder buttons (backend not built yet) ----------

document.getElementById("loginBtn").addEventListener("click", () => {
  alert("Login isn't wired up yet — this comes with the backend step.");
});

document.getElementById("adminBtn").addEventListener("click", () => {
  alert("Admin pin creation isn't wired up yet — this comes with the backend step.");
});

// ---------- Init ----------

renderPins();
