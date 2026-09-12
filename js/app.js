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
    const lat = parseFloat(p.lat);
    const lng = parseFloat(p.lng);
    if (isNaN(lat) || isNaN(lng)) return false;
    const matchesCategory = activeCategory === "all" || p.category === activeCategory;
    const placeTags = p.tags || [];
    const matchesTags = activeTags.size === 0 || [...activeTags].every(t => placeTags.includes(t));
    return matchesCategory && matchesTags;
  });

  visible.forEach(place => {
    const placeId = place._id || place.id;
    const lat = parseFloat(place.lat);
    const lng = parseFloat(place.lng);
    const marker = L.marker([lat, lng], { icon: makeIcon(place.category) }).addTo(map);
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

  const menuWrap = node.querySelector(".place-card-menu");
  const menuList = node.querySelector(".place-card-menu-list");
  const menuItems = Array.isArray(place.menuItems) ? place.menuItems : [];
  if (menuWrap && menuList) {
    menuList.innerHTML = "";
    const menuImageUrls = Array.isArray(place.menuImageUrls) ? place.menuImageUrls.filter(url => url) : [];
    const hasMenuImage = menuImageUrls.length > 0;
    const hasMenuList = menuItems.length > 0;
    if (hasMenuImage || hasMenuList) {
      menuWrap.style.display = "block";
      if (hasMenuImage) {
        menuImageUrls.forEach(url => {
          const banner = document.createElement("div");
          banner.className = "place-card-menu-banner";
          banner.innerHTML = `<img src="${url}" alt="Menu image" style="width:100%;height:180px;object-fit:cover;border-radius:10px;border:1px solid var(--line);display:block;">`;
          menuList.appendChild(banner);
        });
      }
      menuItems.forEach(item => {
        const card = document.createElement("div");
        card.className = "place-card-menu-item";
        const safeName = (item && item.name) ? item.name : "Menu item";
        const safePrice = (item && item.price) ? item.price : "";
        const displayPrice = safePrice.startsWith("₱") ? safePrice : (safePrice ? `₱${safePrice}` : "Price available");
        const hasImage = item && item.imageUrl;
        card.innerHTML = `
          ${hasImage ? `<img class="place-card-menu-thumb" src="${item.imageUrl}" alt="${escapeHtml(safeName)}" loading="lazy">` : '<div class="place-card-menu-thumb" style="display:flex;align-items:center;justify-content:center;color:var(--ink-soft);font-size:11px;background:var(--card);">No pic</div>'}
          <div class="place-card-menu-item-info">
            <div class="place-card-menu-item-name">${escapeHtml(safeName)}</div>
            <div class="place-card-menu-item-price">${displayPrice}</div>
          </div>
          <div style="font-size:12px;color:var(--ink-soft);"></div>
        `;
        menuList.appendChild(card);
      });
    } else {
      menuWrap.style.display = "none";
    }
  }

  // Image handling in place card
  const imageWrap = node.querySelector(".place-card-image-wrap");
  const imageEl = node.querySelector(".place-card-image");
  if (place.imageUrl && imageWrap && imageEl) {
    imageEl.src = place.imageUrl;
    imageWrap.style.display = "block";
    imageEl.onerror = () => { imageWrap.style.display = "none"; };
  }

  // Admin controls
  const adminControls = node.querySelector(".place-admin-controls");
  if (adminControls && State.isAdmin()) {
    adminControls.style.display = "flex";

    const editBtn = node.querySelector(".place-edit-btn");
    const deleteBtn = node.querySelector(".place-delete-btn");
    const approveBtn = node.querySelector(".place-approve-btn");
    const rejectBtn = node.querySelector(".place-reject-btn");

    const isPending = place.status === "pending";
    if (editBtn) editBtn.style.display = isPending ? "none" : "block";
    if (deleteBtn) deleteBtn.style.display = isPending ? "none" : "block";
    if (approveBtn) approveBtn.style.display = isPending ? "block" : "none";
    if (rejectBtn) rejectBtn.style.display = isPending ? "block" : "none";

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

    if (approveBtn) {
      approveBtn.addEventListener("click", async () => {
        try {
          await API.places.approve(placeId);
          closeCard();
          await loadPlaces();
        } catch (err) {
          alert(err.message || "Failed to approve spot");
        }
      });
    }

    if (rejectBtn) {
      rejectBtn.addEventListener("click", async () => {
        if (confirm(`Reject "${place.name}"? It will no longer appear on the map.`)) {
          try {
            await API.places.reject(placeId);
            closeCard();
            await loadPlaces();
          } catch (err) {
            alert(err.message || "Failed to reject spot");
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

// ---------- Mobile Search (overlays map below filters) ----------

const mobileSearchInput = document.getElementById("mobileSearchInput");
const mobileSearchResults = document.getElementById("mobileSearchResults");

function runMobileSearch() {
  const query = mobileSearchInput.value.trim().toLowerCase();
  mobileSearchResults.innerHTML = "";

  if (!query) {
    mobileSearchResults.classList.remove("open");
    return;
  }

  const matches = places.filter(p => {
    const nameMatch = p.name.toLowerCase().includes(query);
    const tags = p.tags || [];
    const tagMatch = tags.some(t => t.toLowerCase().includes(query));
    return nameMatch || tagMatch;
  });

  if (matches.length === 0) {
    mobileSearchResults.innerHTML = `<div class="mobile-search-empty">No places match "${query}".</div>`;
    mobileSearchResults.classList.add("open");
    return;
  }

  matches.forEach(place => {
    const item = document.createElement("div");
    item.className = "mobile-search-result";
    item.innerHTML = `
      <span class="chip-dot dot-${place.category}"></span>
      <div class="mobile-search-result-info">
        <div class="mobile-search-result-name">${place.name}</div>
        <div class="mobile-search-result-meta">${place.category} · ${(place.tags || []).join(", ")}</div>
      </div>
    `;
    item.addEventListener("click", () => {
      map.panTo([place.lat, place.lng]);
      openCard(place);
      mobileSearchResults.classList.remove("open");
    });
    mobileSearchResults.appendChild(item);
  });

  mobileSearchResults.classList.add("open");
}

function closeMobileSearch() {
  mobileSearchResults.classList.remove("open");
  mobileSearchResults.innerHTML = "";
  mobileSearchInput.value = "";
}

const mobileSearchBtn = document.getElementById("mobileSearchBtn");
if (mobileSearchBtn) {
  mobileSearchBtn.addEventListener("click", runMobileSearch);
}
if (mobileSearchInput) {
  mobileSearchInput.addEventListener("keydown", e => { if (e.key === "Enter") runMobileSearch(); });
}
document.addEventListener("click", e => {
  if (mobileSearchResults && mobileSearchResults.classList.contains("open")) {
    if (!e.target.closest(".mobile-search-bar")) {
      mobileSearchResults.classList.remove("open");
    }
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
  const isMobile = window.innerWidth <= 480;
  if (isMobile) {
    // On mobile, keep the panel centered on screen instead of anchoring to the button
    tagFilterPanel.style.top = "120px";
    tagFilterPanel.style.left = "10px";
    tagFilterPanel.style.right = "10px";
    tagFilterPanel.style.width = "auto";
  } else {
    tagFilterPanel.style.top = `${rect.bottom + 8}px`;
    tagFilterPanel.style.left = `${rect.left}px`;
    tagFilterPanel.style.right = "auto";
  }

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
  const addSpotBtn = document.getElementById("addSpotBtn");
  const reviewBtn = document.getElementById("reviewBtn");
  const mySuggestBtn = document.getElementById("mySuggestBtn");
  const userProfile = document.getElementById("userProfile");
  const userEmailBadge = document.getElementById("userEmailBadge");

  // Mobile drawer elements
  const mobileLoginBtn = document.getElementById("mobileLoginBtn");
  const mobileLogoutBtn = document.getElementById("mobileLogoutBtn");
  const mobileAddSpotBtn = document.getElementById("mobileAddSpotBtn");
  const mobileReviewBtn = document.getElementById("mobileReviewBtn");
  const mobileMySuggestBtn = document.getElementById("mobileMySuggestBtn");
  const mobileUserProfile = document.getElementById("mobileUserProfile");
  const mobileUserEmail = document.getElementById("mobileUserEmail");

  if (loggedIn && user) {
    if (loginBtn) loginBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "block";
    if (userProfile) {
      userProfile.style.display = "flex";
      userEmailBadge.innerHTML = `${user.email} ${user.role === "admin" ? '<span class="user-role-badge">ADMIN</span>' : ""}`;
    }
    if (addSpotBtn) {
      addSpotBtn.style.display = "block";
      addSpotBtn.textContent = user.role === "admin" ? "+ Add Spot" : "+ Suggest Spot";
    }
    if (mySuggestBtn) {
      mySuggestBtn.style.display = user.role === "admin" ? "none" : "inline-block";
    }
    if (reviewBtn) {
      reviewBtn.style.display = user.role === "admin" ? "inline-block" : "none";
    }
    // Mobile drawer
    if (mobileLoginBtn) mobileLoginBtn.style.display = "none";
    if (mobileLogoutBtn) mobileLogoutBtn.style.display = "block";
    if (mobileUserProfile) {
      mobileUserProfile.style.display = "flex";
      mobileUserEmail.textContent = user.email;
    }
    if (mobileAddSpotBtn) {
      mobileAddSpotBtn.style.display = "block";
      mobileAddSpotBtn.textContent = user.role === "admin" ? "+ Add Spot" : "+ Suggest Spot";
    }
    if (mobileMySuggestBtn) {
      mobileMySuggestBtn.style.display = user.role === "admin" ? "none" : "block";
    }
    if (mobileReviewBtn) {
      mobileReviewBtn.style.display = user.role === "admin" ? "block" : "none";
    }
  } else {
    if (loginBtn) loginBtn.style.display = "block";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (userProfile) userProfile.style.display = "none";
    if (addSpotBtn) addSpotBtn.style.display = "none";
    if (mySuggestBtn) mySuggestBtn.style.display = "none";
    if (reviewBtn) reviewBtn.style.display = "none";
    // Mobile drawer
    if (mobileLoginBtn) mobileLoginBtn.style.display = "block";
    if (mobileLogoutBtn) mobileLogoutBtn.style.display = "none";
    if (mobileUserProfile) mobileUserProfile.style.display = "none";
    if (mobileAddSpotBtn) mobileAddSpotBtn.style.display = "none";
    if (mobileMySuggestBtn) mobileMySuggestBtn.style.display = "none";
    if (mobileReviewBtn) mobileReviewBtn.style.display = "none";
  }
}

// ---------- Mobile Hamburger Menu ----------

const hamburgerBtn = document.getElementById("hamburgerBtn");
const mobileNav = document.getElementById("mobileNav");

function closeMobileNav() {
  if (mobileNav) mobileNav.style.display = "none";
  if (hamburgerBtn) hamburgerBtn.classList.remove("hamburger-open");
}

if (hamburgerBtn) {
  hamburgerBtn.addEventListener("click", () => {
    const isOpen = mobileNav.style.display === "flex";
    if (isOpen) {
      closeMobileNav();
    } else {
      mobileNav.style.display = "flex";
      hamburgerBtn.classList.add("hamburger-open");
    }
  });
}

// Mobile drawer buttons mirror the desktop buttons
const mobileLoginBtnEl = document.getElementById("mobileLoginBtn");
const mobileLogoutBtnEl = document.getElementById("mobileLogoutBtn");
const mobileAddSpotBtnEl = document.getElementById("mobileAddSpotBtn");
const mobileMySuggestBtnEl = document.getElementById("mobileMySuggestBtn");
const mobileReviewBtnEl = document.getElementById("mobileReviewBtn");

if (mobileLoginBtnEl) {
  mobileLoginBtnEl.addEventListener("click", () => {
    closeMobileNav();
    openAuthModal("login");
  });
}

if (mobileLogoutBtnEl) {
  mobileLogoutBtnEl.addEventListener("click", () => {
    closeMobileNav();
    State.clearSession();
    updateAuthUI();
    if (currentCard && currentPlace) openCard(currentPlace);
  });
}

if (mobileAddSpotBtnEl) {
  mobileAddSpotBtnEl.addEventListener("click", () => {
    closeMobileNav();
    if (!State.isLoggedIn()) {
      openAuthModal("login", "Please log in to suggest a spot.");
      return;
    }
    openPlaceModal();
  });
}

if (mobileMySuggestBtnEl) {
  mobileMySuggestBtnEl.addEventListener("click", () => {
    closeMobileNav();
    openMySuggestPanel();
  });
}

if (mobileReviewBtnEl) {
  mobileReviewBtnEl.addEventListener("click", () => {
    closeMobileNav();
    openReviewPanel();
  });
}

// Close mobile nav when clicking outside
document.addEventListener("click", e => {
  if (mobileNav && mobileNav.style.display === "flex") {
    if (!e.target.closest(".mobile-nav") && !e.target.closest(".hamburger-btn")) {
      closeMobileNav();
    }
  }
});

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
const placeModalMinBtn = document.getElementById("placeModalMinBtn");
const placeModalCloseBtn = document.getElementById("placeModalCloseBtn");
const minimizedPlacePill = document.getElementById("minimizedPlacePill");
const minimizedPillTitle = document.getElementById("minimizedPillTitle");
const restorePlaceModalBtn = document.getElementById("restorePlaceModalBtn");
const closeMinimizedPlaceBtn = document.getElementById("closeMinimizedPlaceBtn");

const placeIdInput = document.getElementById("placeIdInput");
const placeNameInput = document.getElementById("placeNameInput");
const placeCategorySelect = document.getElementById("placeCategorySelect");
const placeTagsInput = document.getElementById("placeTagsInput");
const placeLatInput = document.getElementById("placeLatInput");
const placeLngInput = document.getElementById("placeLngInput");
const placeAddressInput = document.getElementById("placeAddressInput");
const placeDescInput = document.getElementById("placeDescInput");
const placeImageUrlInput = document.getElementById("placeImageUrlInput");
const placeFileInput = document.getElementById("placeFileInput");
const imageDropzone = document.getElementById("imageDropzone");
const imagePreviewCard = document.getElementById("imagePreviewCard");
const imagePreviewImg = document.getElementById("imagePreviewImg");
const imagePreviewName = document.getElementById("imagePreviewName");
const removeImageBtn = document.getElementById("removeImageBtn");
const placeModalError = document.getElementById("placeModalError");
const placeSubmitBtn = document.getElementById("placeSubmitBtn");
const menuBuilderList = document.getElementById("menuBuilderList");
const addMenuItemBtn = document.getElementById("addMenuItemBtn");
const menuImageUrlInput = document.getElementById("menuImageUrlInput");
const menuFileInput = document.getElementById("menuFileInput");
const menuUploadDropzone = document.getElementById("menuUploadDropzone");
const menuUploadGallery = document.getElementById("menuUploadGallery");
let menuItemIdCounter = 0;
const menuItemFiles = new Map();
let menuImageIdCounter = 0;
const menuImageFiles = new Map();    // tempId -> File (newly selected images)
const menuImageExisting = new Map(); // tempId -> URL (already saved images, edit mode)

const useCurrentLocationBtn = document.getElementById("useCurrentLocationBtn");
const pickOnMapBtn = document.getElementById("pickOnMapBtn");
const mapPickerBanner = document.getElementById("mapPickerBanner");
const mapPickerTitle = document.getElementById("mapPickerTitle");
const pickerCoordsDisplay = document.getElementById("pickerCoordsDisplay");
const confirmLocationBtn = document.getElementById("confirmLocationBtn");
const cancelPickOnMapBtn = document.getElementById("cancelPickOnMapBtn");
const locationStatusBadge = document.getElementById("locationStatusBadge");
const locationStatusText = document.getElementById("locationStatusText");

function makeAdminPickerIcon(isLanded = false) {
  return L.divIcon({
    className: "",
    html: `<div class="admin-draggable-pin ${isLanded ? "pin-landed" : ""}" title="Drag to adjust position"></div>`,
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

function createOrUpdatePickerMarker(lat, lng, isLanded = false) {
  if (!adminPickerMarker) {
    adminPickerMarker = L.marker([lat, lng], {
      draggable: true,
      icon: makeAdminPickerIcon(isLanded),
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
    adminPickerMarker.setIcon(makeAdminPickerIcon(isLanded));
  }
}

function removePickerMarker() {
  if (adminPickerMarker) {
    map.removeLayer(adminPickerMarker);
    adminPickerMarker = null;
  }
}

// "Use My Current Location" via browser GPS — lands the pin on the map and shows location
useCurrentLocationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser.");
    return;
  }

  useCurrentLocationBtn.disabled = true;
  useCurrentLocationBtn.innerHTML = `<span>⏳</span> Acquiring GPS…`;

  navigator.geolocation.getCurrentPosition(
    position => {
      useCurrentLocationBtn.disabled = false;
      useCurrentLocationBtn.innerHTML = `<span>📍</span> Use My Current Location`;
      const { latitude, longitude } = position.coords;

      updateLocationUI(latitude, longitude, `GPS Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);
      createOrUpdatePickerMarker(latitude, longitude, true);

      // Smoothly fly to where the pin landed on the map
      map.flyTo([latitude, longitude], 17, { duration: 1.2 });

      // Show the floating banner so the user can clearly see where the pin landed
      isPickingOnMap = true;
      placeModal.style.display = "none";
      if (mapPickerTitle) {
        mapPickerTitle.textContent = "📍 Pin landed at your location! Drag to fine-tune.";
      }
      mapPickerBanner.style.display = "block";
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
  if (mapPickerTitle) {
    mapPickerTitle.textContent = "Drag the pin or click on the map";
  }
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

// ---------- Minimize & Restore Modal ----------

function minimizePlaceModal() {
  placeModal.style.display = "none";
  const name = placeNameInput.value.trim();
  const isEdit = Boolean(placeIdInput.value);
  minimizedPillTitle.textContent = name
    ? `${isEdit ? "Editing" : "Adding"}: "${name}"`
    : (isEdit ? "Editing Spot (Click to expand)" : "Adding Spot (Click to expand)");
  minimizedPlacePill.style.display = "flex";
}

function restorePlaceModal() {
  minimizedPlacePill.style.display = "none";
  placeModal.style.display = "flex";
}

if (placeModalMinBtn) {
  placeModalMinBtn.addEventListener("click", minimizePlaceModal);
}

if (restorePlaceModalBtn) {
  restorePlaceModalBtn.addEventListener("click", restorePlaceModal);
}

if (closeMinimizedPlaceBtn) {
  closeMinimizedPlaceBtn.addEventListener("click", () => {
    closePlaceModal();
  });
}

function resetMenuImagePicker() {
  menuImageFiles.clear();
  menuImageExisting.clear();
  if (menuImageUrlInput) menuImageUrlInput.value = "[]";
  if (menuFileInput) menuFileInput.value = "";
  if (menuUploadDropzone) menuUploadDropzone.style.display = "block";
  if (menuUploadGallery) {
    menuUploadGallery.innerHTML = "";
    menuUploadGallery.style.display = "none";
  }
}

function renderMenuUploadGallery() {
  if (!menuUploadGallery) return;
  const total = menuImageFiles.size + menuImageExisting.size;
  if (total === 0) {
    menuUploadGallery.innerHTML = "";
    menuUploadGallery.style.display = "none";
    if (menuUploadDropzone) menuUploadDropzone.style.display = "block";
    return;
  }

  if (menuUploadDropzone) menuUploadDropzone.style.display = "block";
  if (menuUploadGallery) menuUploadGallery.style.display = "flex";

  menuUploadGallery.innerHTML = "";

  menuImageExisting.forEach((url, id) => {
    const tile = document.createElement("div");
    tile.className = "menu-upload-tile";
    tile.innerHTML = `
      <img class="menu-upload-tile-img" src="${url}" alt="Existing menu image" loading="lazy">
      <button type="button" class="menu-upload-tile-remove" data-purpose="existing" data-id="${id}" title="Remove this image">✕</button>
      <div class="menu-upload-tile-label">Saved</div>
    `;
    menuUploadGallery.appendChild(tile);
  });

  menuImageFiles.forEach((file, id) => {
    const tile = document.createElement("div");
    tile.className = "menu-upload-tile";
    const reader = new FileReader();
    reader.onload = () => {
      const img = tile.querySelector(".menu-upload-tile-img");
      if (img) img.src = reader.result;
    };
    reader.readAsDataURL(file);
    tile.innerHTML = `
      <img class="menu-upload-tile-img" src="" alt="Menu image preview">
      <button type="button" class="menu-upload-tile-remove" data-purpose="new" data-id="${id}" title="Remove this image">✕</button>
      <div class="menu-upload-tile-label">${escapeHtml(file.name)}</div>
    `;
    menuUploadGallery.appendChild(tile);
  });
}

function removeMenuImageFromGallery(purpose, id) {
  if (purpose === "existing") {
    menuImageExisting.delete(id);
  } else {
    menuImageFiles.delete(id);
  }
  renderMenuUploadGallery();
}

function addMenuImageFiles(fileList) {
  if (!fileList) return;
  const files = Array.from(fileList).filter(f => f && f.type && f.type.startsWith("image/"));
  files.forEach(file => {
    const id = `menu-img-${menuImageIdCounter++}`;
    menuImageFiles.set(id, file);
  });
  renderMenuUploadGallery();
}

if (menuUploadDropzone && menuFileInput) {
  menuUploadDropzone.addEventListener("click", () => menuFileInput.click());
  menuUploadDropzone.addEventListener("dragover", e => {
    e.preventDefault();
    menuUploadDropzone.style.borderColor = "var(--teal)";
    menuUploadDropzone.style.background = "rgba(47, 111, 94, 0.04)";
  });
  menuUploadDropzone.addEventListener("dragleave", () => {
    menuUploadDropzone.style.borderColor = "";
    menuUploadDropzone.style.background = "";
  });
  menuUploadDropzone.addEventListener("drop", e => {
    e.preventDefault();
    menuUploadDropzone.style.borderColor = "";
    menuUploadDropzone.style.background = "";
    addMenuImageFiles(e.dataTransfer && e.dataTransfer.files);
  });
  menuFileInput.addEventListener("change", () => {
    addMenuImageFiles(menuFileInput.files);
    menuFileInput.value = "";
  });
}

// Delegate remove clicks for dynamically-added gallery tiles
if (menuUploadGallery) {
  menuUploadGallery.addEventListener("click", e => {
    const btn = e.target.closest(".menu-upload-tile-remove");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    removeMenuImageFromGallery(btn.dataset.purpose, btn.dataset.id);
  });
}

function resetMenuBuilder() {
  if (!menuBuilderList) return;
  menuBuilderList.innerHTML = "";
  menuItemFiles.clear();
}

function buildMenuItemRow(item = {}) {
  if (!menuBuilderList) return null;

  const row = document.createElement("div");
  row.className = "menu-item-row";
  row.dataset.menuId = `menu-${menuItemIdCounter++}`;

  const menuId = row.dataset.menuId;
  const name = item.name || "";
  const price = item.price || "";
  const imageUrl = item.imageUrl || "";

  row.innerHTML = `
    <div class="menu-item-header">
      <label>Menu item</label>
      <button type="button" class="menu-item-remove-row">Remove</button>
    </div>
    <div class="menu-item-main">
      <div class="menu-item-photo-box">
        <input type="file" class="menu-item-file-input" accept="image/*" style="display: none;">
        <button type="button" class="menu-item-photo-trigger">Add photo</button>
        <div class="menu-item-preview-card" style="display: ${imageUrl ? "flex" : "none"};">
          <img class="menu-item-preview-image" src="${imageUrl}" alt="Menu item preview">
          <div class="menu-item-preview-name">${imageUrl ? "Saved image" : "Preview"}</div>
        </div>
      </div>
      <div class="menu-item-field-wrap">
        <input type="text" class="menu-item-name" value="${escapeHtml(name)}" placeholder="Dish / drink name">
        <input type="text" class="menu-item-price" value="${escapeHtml(price)}" placeholder="₱0.00">
      </div>
    </div>
  `;

  const fileInput = row.querySelector(".menu-item-file-input");
  const photoTrigger = row.querySelector(".menu-item-photo-trigger");
  const previewCard = row.querySelector(".menu-item-preview-card");
  const previewImage = row.querySelector(".menu-item-preview-image");
  const previewName = row.querySelector(".menu-item-preview-name");

  if (imageUrl) {
    previewImage.onerror = () => {
      previewCard.style.display = "none";
      previewName.textContent = "Preview";
    };
    row.dataset.imageUrl = imageUrl;
  }

  photoTrigger.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    menuItemFiles.set(menuId, file);
    const reader = new FileReader();
    reader.onload = () => {
      previewImage.src = reader.result;
      previewCard.style.display = "flex";
      previewName.textContent = file.name;
      row.dataset.imageUrl = "";
    };
    reader.readAsDataURL(file);
  });

  const removePreviewBtn = row.querySelector(".menu-item-preview-card");
  removePreviewBtn.addEventListener("click", () => {
    if (fileInput.files && fileInput.files.length) {
      fileInput.value = "";
      menuItemFiles.delete(menuId);
    }
    row.dataset.imageUrl = "";
    previewCard.style.display = "none";
    previewImage.src = "";
    previewName.textContent = "Preview";
  });

  row.querySelector(".menu-item-remove-row").addEventListener("click", () => {
    row.remove();
    menuItemFiles.delete(menuId);
  });

  menuBuilderList.appendChild(row);
  return row;
}

if (addMenuItemBtn) {
  addMenuItemBtn.addEventListener("click", () => buildMenuItemRow());
}

function resetImagePicker() {
  if (placeImageUrlInput) placeImageUrlInput.value = "";
  if (placeFileInput) placeFileInput.value = "";
  if (imageDropzone) imageDropzone.style.display = "block";
  if (imagePreviewCard) imagePreviewCard.style.display = "none";
}

function showImagePreviewLocal(file) {
  const reader = new FileReader();
  reader.onload = () => {
    if (imagePreviewImg) imagePreviewImg.src = reader.result;
    if (imagePreviewName) imagePreviewName.textContent = file.name;
    if (imageDropzone) imageDropzone.style.display = "none";
    if (imagePreviewCard) imagePreviewCard.style.display = "flex";
  };
  reader.readAsDataURL(file);
}

async function uploadToCloudinary(file) {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error("Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET in config.js");
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(endpoint, { method: "POST", body: formData });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Invalid response from Cloudinary");
  }

  if (!response.ok || !data.secure_url) {
    const msg = (data && data.error && data.error.message) || "Image upload failed";
    throw new Error(msg);
  }

  return data.secure_url;
}

if (imageDropzone && placeFileInput) {
  imageDropzone.addEventListener("click", () => placeFileInput.click());

  imageDropzone.addEventListener("dragover", e => {
    e.preventDefault();
    imageDropzone.classList.add("dragover");
  });

  imageDropzone.addEventListener("dragleave", () => {
    imageDropzone.classList.remove("dragover");
  });

  imageDropzone.addEventListener("drop", e => {
    e.preventDefault();
    imageDropzone.classList.remove("dragover");
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file && file.type && file.type.startsWith("image/")) {
      showImagePreviewLocal(file);
    }
  });

  placeFileInput.addEventListener("change", () => {
    const file = placeFileInput.files && placeFileInput.files[0];
    if (file) {
      showImagePreviewLocal(file);
    }
  });
}

if (removeImageBtn) {
  removeImageBtn.addEventListener("click", e => {
    e.preventDefault();
    resetImagePicker();
  });
}

function openPlaceModal(editPlace = null) {
  // Editing existing spots is admin-only; suggesting a new spot is open to any logged-in user.
  const isAdmin = State.isAdmin();
  if (editPlace && !isAdmin) {
    alert("Only admins can edit spots.");
    return;
  }
  if (!State.isLoggedIn()) {
    openAuthModal("login", "Please log in to add a spot.");
    return;
  }

  placeModalError.style.display = "none";
  minimizedPlacePill.style.display = "none";

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

    if (editPlace.imageUrl && imagePreviewImg && imageDropzone && imagePreviewCard && imagePreviewName) {
      placeImageUrlInput.value = editPlace.imageUrl;
      imagePreviewImg.src = editPlace.imageUrl;
      imagePreviewName.textContent = "Existing photo URL";
      imageDropzone.style.display = "none";
      imagePreviewCard.style.display = "flex";
    } else {
      resetImagePicker();
    }

    if (menuImageUrlInput && menuUploadDropzone && menuUploadGallery) {
      resetMenuImagePicker();
      const existingMenuUrls = Array.isArray(editPlace.menuImageUrls)
        ? editPlace.menuImageUrls.filter(url => url)
        : [];
      existingMenuUrls.forEach(url => {
        const id = `menu-img-${menuImageIdCounter++}`;
        menuImageExisting.set(id, url);
      });
      renderMenuUploadGallery();
    }

    resetMenuBuilder();
    const existingMenuItems = Array.isArray(editPlace.menuItems) ? editPlace.menuItems : [];
    if (existingMenuItems.length === 0) {
      buildMenuItemRow();
    } else {
      existingMenuItems.forEach(item => buildMenuItemRow(item));
    }
  } else {
    placeModalTitle.textContent = isAdmin ? "Add New Spot" : "Suggest New Spot";
    placeIdInput.value = "";
    placeNameInput.value = "";
    placeCategorySelect.value = "food";
    placeTagsInput.value = "";
    placeLatInput.value = "";
    placeLngInput.value = "";
    placeAddressInput.value = "";
    placeDescInput.value = "";
    placeSubmitBtn.textContent = isAdmin ? "Save Spot" : "Submit for Review";

    locationStatusBadge.classList.remove("has-location");
    locationStatusText.textContent = "No location selected (use buttons below)";
    removePickerMarker();
    resetImagePicker();
    resetMenuImagePicker();
    resetMenuBuilder();
    buildMenuItemRow();
  }

  placeModal.style.display = "flex";
}

function closePlaceModal() {
  placeModal.style.display = "none";
  mapPickerBanner.style.display = "none";
  minimizedPlacePill.style.display = "none";
  isPickingOnMap = false;
  removePickerMarker();
}

document.getElementById("addSpotBtn").addEventListener("click", () => {
  if (!State.isLoggedIn()) {
    openAuthModal("login", "Please log in to suggest a spot.");
    return;
  }
  openPlaceModal();
});

// ---------- Review Panel (admin) & My Suggestions (user) ----------

const reviewPanel = document.getElementById("reviewPanel");
const reviewPanelList = document.getElementById("reviewPanelList");
const reviewPanelClose = document.getElementById("reviewPanelClose");
const reviewBtn = document.getElementById("reviewBtn");
const mySuggestPanel = document.getElementById("mySuggestPanel");
const mySuggestList = document.getElementById("mySuggestList");
const mySuggestPanelClose = document.getElementById("mySuggestPanelClose");
const mySuggestBtn = document.getElementById("mySuggestBtn");

function statusBadge(status) {
  const label = status || "approved";
  const cls = ["pending", "approved", "rejected"].includes(label) ? label : "approved";
  return `<span class="place-status-badge ${cls}">${cls}</span>`;
}

function closeAllPanels() {
  if (reviewPanel) reviewPanel.style.display = "none";
  if (mySuggestPanel) mySuggestPanel.style.display = "none";
}

async function openReviewPanel() {
  closeAllPanels();
  reviewPanel.style.display = "flex";
  reviewPanelList.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ink-soft);font-size:13px;">Loading pending spots...</div>`;

  try {
    const all = await API.places.getAll();
    const pending = all.filter(p => p.status === "pending");

    if (pending.length === 0) {
      reviewPanelList.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ink-soft);font-size:13px;">No pending spots. All clear!</div>`;
      return;
    }

    reviewPanelList.innerHTML = "";
    pending.forEach(place => {
      const item = document.createElement("div");
      item.className = "review-panel-item";
      const coordText = `📍 ${parseFloat(place.lat).toFixed(5)}, ${parseFloat(place.lng).toFixed(5)}`;
      item.innerHTML = `
        <div class="review-panel-item-info">
          <div class="review-panel-item-name">${escapeHtml(place.name)} ${statusBadge(place.status)}</div>
          <div class="review-panel-item-meta">${place.category} · ${escapeHtml(place.address || "No address")}</div>
          <div class="review-panel-item-coords">${coordText}</div>
          <div class="review-panel-item-desc">${escapeHtml(place.description || "No description")}</div>
          ${place.imageUrl ? `<img class="review-panel-item-img" src="${place.imageUrl}" alt="Suggestion photo">` : ""}
          ${Array.isArray(place.menuImageUrls) && place.menuImageUrls.length > 0 ? `<div class="review-panel-item-menu"><strong>Menu (${place.menuImageUrls.length}):</strong> ${place.menuImageUrls.filter(u => u).map(u => `<a href="${u}" target="_blank" rel="noopener">View menu image</a>`).join(" · ")}</div>` : ""}
          ${place.menuItems && place.menuItems.length > 0 ? `<div class="review-panel-item-menu">${place.menuItems.map(m => `• ${escapeHtml(m.name || "Item")}${m.price ? " — ₱" + escapeHtml(m.price) : ""}`).join("<br>")}</div>` : ""}
        </div>
        <div class="review-panel-item-actions">
          <button class="review-btn-view" data-view="true">View</button>
          <button class="review-btn-approve">Approve</button>
          <button class="review-btn-reject">Reject</button>
        </div>
      `;

      item.querySelector(".review-btn-view").addEventListener("click", () => {
        closeAllPanels();
        map.panTo([place.lat, place.lng]);
        openCard(place);
      });

      item.querySelector(".review-btn-approve").addEventListener("click", async () => {
        try {
          await API.places.approve(place._id || place.id);
          item.remove();
          await loadPlaces();
          if (reviewPanelList.children.length === 0) {
            reviewPanelList.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ink-soft);font-size:13px;">No pending spots. All clear!</div>`;
          }
        } catch (err) {
          alert(err.message || "Failed to approve");
        }
      });

      item.querySelector(".review-btn-reject").addEventListener("click", async () => {
        try {
          await API.places.reject(place._id || place.id);
          item.remove();
          if (reviewPanelList.children.length === 0) {
            reviewPanelList.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ink-soft);font-size:13px;">No pending spots. All clear!</div>`;
          }
        } catch (err) {
          alert(err.message || "Failed to reject");
        }
      });

      reviewPanelList.appendChild(item);
    });
  } catch (err) {
    reviewPanelList.innerHTML = `<div style="padding:20px;text-align:center;color:#dc2626;font-size:13px;">Failed to load pending spots.</div>`;
  }
}

async function openMySuggestPanel() {
  closeAllPanels();
  mySuggestPanel.style.display = "flex";
  mySuggestList.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ink-soft);font-size:13px;">Loading your suggestions...</div>`;

  try {
    const mine = await API.places.getMine();

    if (!mine || mine.length === 0) {
      mySuggestList.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ink-soft);font-size:13px;">You haven't submitted any suggestions yet.</div>`;
      return;
    }

    mySuggestList.innerHTML = "";
    mine.slice().reverse().forEach(place => {
      const item = document.createElement("div");
      item.className = "review-panel-item";
      item.innerHTML = `
        <div class="review-panel-item-info">
          <div class="review-panel-item-name">${escapeHtml(place.name)} ${statusBadge(place.status)}</div>
          <div class="review-panel-item-meta">${place.category} · ${escapeHtml(place.address || "No address")}</div>
          <div class="review-panel-item-coords">📍 ${parseFloat(place.lat).toFixed(5)}, ${parseFloat(place.lng).toFixed(5)}</div>
          <div class="review-panel-item-desc">${escapeHtml(place.description || "No description")}</div>
        </div>
        <div class="review-panel-item-actions">
          <button class="review-btn-view" data-view="true">View</button>
        </div>
      `;

      item.querySelector(".review-btn-view").addEventListener("click", () => {
        closeAllPanels();
        map.panTo([place.lat, place.lng]);
        openCard(place);
      });

      mySuggestList.appendChild(item);
    });
  } catch (err) {
    mySuggestList.innerHTML = `<div style="padding:20px;text-align:center;color:#dc2626;font-size:13px;">Failed to load your suggestions.</div>`;
  }
}

if (reviewBtn) {
  reviewBtn.addEventListener("click", () => {
    if (reviewPanel.style.display === "none" || !reviewPanel.style.display) {
      openReviewPanel();
    } else {
      reviewPanel.style.display = "none";
    }
  });
}

if (reviewPanelClose) {
  reviewPanelClose.addEventListener("click", () => {
    reviewPanel.style.display = "none";
  });
}

if (mySuggestBtn) {
  mySuggestBtn.addEventListener("click", () => {
    if (mySuggestPanel.style.display === "none" || !mySuggestPanel.style.display) {
      openMySuggestPanel();
    } else {
      mySuggestPanel.style.display = "none";
    }
  });
}

if (mySuggestPanelClose) {
  mySuggestPanelClose.addEventListener("click", () => {
    mySuggestPanel.style.display = "none";
  });
}
if (placeModalCloseBtn) {
  placeModalCloseBtn.addEventListener("click", closePlaceModal);
}

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

  try {
    placeSubmitBtn.disabled = true;
    placeSubmitBtn.textContent = "Uploading image…";

    let imageUrl = placeImageUrlInput ? placeImageUrlInput.value.trim() : "";
    const file = placeFileInput && placeFileInput.files && placeFileInput.files[0];

    if (file) {
      imageUrl = await uploadToCloudinary(file);
    }

    let menuImageUrls = [];
    for (const url of menuImageExisting.values()) {
      menuImageUrls.push(url);
    }
    for (const file of menuImageFiles.values()) {
      const uploaded = await uploadToCloudinary(file);
      menuImageUrls.push(uploaded);
    }
    menuImageUrls = menuImageUrls.filter(url => url);

    const menuItems = [];
    const rows = Array.from(menuBuilderList.querySelectorAll(".menu-item-row"));
    for (const row of rows) {
      const itemName = row.querySelector(".menu-item-name")?.value.trim() || "";
      const priceValue = row.querySelector(".menu-item-price")?.value.trim() || "";
      const menuImageUrlForItem = row.dataset.imageUrl || "";
      const menuFileForItem = menuItemFiles.get(row.dataset.menuId);

      let finalImageUrl = menuImageUrlForItem;
      if (menuFileForItem) {
        finalImageUrl = await uploadToCloudinary(menuFileForItem);
      }

      if (itemName || priceValue || finalImageUrl) {
        menuItems.push({
          name: itemName,
          price: priceValue,
          imageUrl: finalImageUrl
        });
      }
    }

    const payload = { name, category, tags, lat, lng, address, description, imageUrl, menuImageUrls, menuItems };

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
    const isAdminMode = id || State.isAdmin();
    placeSubmitBtn.textContent = isAdminMode ? (id ? "Update Spot" : "Save Spot") : "Submit for Review";
  }
});

// Close modals when clicking outside card
window.addEventListener("click", e => {
  if (e.target === authModal) closeAuthModal();
  if (e.target === placeModal) closePlaceModal();
});

// ---------- Data Initialization ----------

let loadPlacesRetries = 0;
const MAX_LOAD_RETRIES = 3;

async function loadPlaces() {
  const statusEl = document.getElementById("statusPill");
  if (statusEl) statusEl.textContent = "Loading places…";

  try {
    const data = await API.places.getAll();
    if (Array.isArray(data) && data.length > 0) {
      places = data;
      loadPlacesRetries = 0;
    } else if (Array.isArray(data) && data.length === 0 && typeof PLACES !== "undefined") {
      places = PLACES;
      loadPlacesRetries = 0;
    } else if (typeof PLACES !== "undefined") {
      places = PLACES;
      loadPlacesRetries = 0;
    }
  } catch (err) {
    console.warn("Backend unavailable, loading local fallback data:", err.message);
    if (typeof PLACES !== "undefined") {
      places = PLACES;
    }
    // Auto-retry on failure up to 3 times
    if (loadPlacesRetries < MAX_LOAD_RETRIES) {
      loadPlacesRetries++;
      console.log(`Retrying loadPlaces (attempt ${loadPlacesRetries})...`);
      await new Promise(r => setTimeout(r, 2000 * loadPlacesRetries));
      return loadPlaces();
    }
  }

  refreshAllTags();
  renderPins();
}

async function refreshLocations() {
  loadPlacesRetries = 0;
  await loadPlaces();
}

const refreshLocationsBtn = document.getElementById("refreshLocationsBtn");
if (refreshLocationsBtn) {
  refreshLocationsBtn.addEventListener("click", refreshLocations);
}

async function init() {
  updateAuthUI();
  await State.refreshSaved();
  await loadPlaces();
}

init();

/* ================================================================
 * Menu Image Lightbox — full-screen zoom / pan viewer
 *
 * Clicking any "Menu image" banner on a place card opens a
 * full-screen viewer. Zoom with + / − / reset buttons, mouse
 * wheel (ctrl not required), or keyboard (+ / − / 0). Drag to
 * pan when zoomed in. ‹ › buttons or ← / → keys navigate between
 * the card's menu images. Esc or ✕ closes. Backdrop click closes.
 * ================================================================ */

const lightboxRoot = document.getElementById("lightbox");
const lightboxBackdropEl = document.getElementById("lightboxBackdrop");
const lightboxCounterEl = document.getElementById("lightboxCounter");
const lightboxStageEl = document.getElementById("lightboxStage");
const lightboxImgEl = document.getElementById("lightboxImg");
const lightboxZoomInBtn = document.getElementById("lightboxZoomIn");
const lightboxZoomResetBtn = document.getElementById("lightboxZoomReset");
const lightboxZoomOutBtn = document.getElementById("lightboxZoomOut");
const lightboxCloseBtn = document.getElementById("lightboxClose");
const lightboxPrevBtn = document.getElementById("lightboxPrev");
const lightboxNextBtn = document.getElementById("lightboxNext");

const lightboxState = {
  items: [],      // array of src URLs currently loaded
  index: 0,       // current item index
  zoom: 1,        // current scale
  minZoom: 0.5,
  maxZoom: 6,
  panX: 0,
  panY: 0,
  dragging: false,
  lastClientX: 0,
  lastClientY: 0
};

function lightboxOpen(items, index) {
  if (!lightboxRoot) return;
  const urls = Array.isArray(items) ? items.filter(url => url) : [];
  if (urls.length === 0) return;

  lightboxState.items = urls;
  lightboxState.index = Math.max(0, Math.min(index || 0, urls.length - 1));
  lightboxResetZoom();
  lightboxShowCurrent();

  lightboxRoot.classList.add("open");
  document.body.style.overflow = "hidden";
}

function lightboxClose() {
  if (!lightboxRoot) return;
  lightboxRoot.classList.remove("open");
  document.body.style.overflow = "";
  lightboxResetZoom();
}

function lightboxShowCurrent() {
  if (!lightboxImgEl) return;
  const url = lightboxState.items[lightboxState.index];
  if (!url) return;
  lightboxImgEl.src = url;
  if (lightboxCounterEl) {
    lightboxCounterEl.textContent = `${lightboxState.index + 1} / ${lightboxState.items.length}`;
  }
  lightboxResetZoom();
}

function lightboxNext() {
  const total = lightboxState.items.length;
  if (total === 0) return;
  lightboxState.index = (lightboxState.index + 1) % total;
  lightboxShowCurrent();
}

function lightboxPrev() {
  const total = lightboxState.items.length;
  if (total === 0) return;
  lightboxState.index = (lightboxState.index - 1 + total) % total;
  lightboxShowCurrent();
}

function lightboxSetZoom(scale) {
  if (!lightboxImgEl) return;
  lightboxState.zoom = Math.max(
    lightboxState.minZoom,
    Math.min(lightboxState.maxZoom, scale)
  );
  lightboxApplyTransform();
}

function lightboxResetZoom() {
  lightboxState.zoom = 1;
  lightboxState.panX = 0;
  lightboxState.panY = 0;
  if (lightboxImgEl) lightboxImgEl.style.transform = "";
}

function lightboxApplyTransform() {
  if (!lightboxImgEl) return;
  lightboxImgEl.style.transform =
    `translate(calc(-50% + ${lightboxState.panX}px), calc(-50% + ${lightboxState.panY}px)) scale(${lightboxState.zoom})`;
}

// Open lightbox on banner clicks (delegated so it covers dynamically-rendered cards)
document.addEventListener("click", e => {
  const banner = e.target.closest && e.target.closest(".place-card-menu-banner");
  if (!banner) return;
  const card = banner.closest(".place-card-menu-wrap") || banner.closest(".place-card-menu");
  if (!card) return;
  const imgs = Array.from(card.querySelectorAll(".place-card-menu-banner img"));
  const urls = imgs.map(img => img.getAttribute("src") || "").filter(Boolean);
  if (urls.length === 0) return;
  const clickedIndex = imgs.indexOf(e.target.closest("img"));
  lightboxOpen(urls, clickedIndex >= 0 ? clickedIndex : 0);
});

if (lightboxZoomInBtn) {
  lightboxZoomInBtn.addEventListener("click", () => lightboxSetZoom(lightboxState.zoom + 0.4));
}
if (lightboxZoomOutBtn) {
  lightboxZoomOutBtn.addEventListener("click", () => lightboxSetZoom(lightboxState.zoom - 0.4));
}
if (lightboxZoomResetBtn) {
  lightboxZoomResetBtn.addEventListener("click", () => lightboxResetZoom());
}
if (lightboxCloseBtn) {
  lightboxCloseBtn.addEventListener("click", () => lightboxClose());
}
if (lightboxPrevBtn) {
  lightboxPrevBtn.addEventListener("click", () => lightboxPrev());
}
if (lightboxNextBtn) {
  lightboxNextBtn.addEventListener("click", () => lightboxNext());
}

// Drag to pan (only while zoomed; prevents text/cursor selection artifacts)
if (lightboxStageEl) {
  lightboxStageEl.addEventListener("mousedown", e => {
    if (lightboxState.zoom <= 1.0 || e.target !== lightboxImgEl) return;
    lightboxState.dragging = true;
    lightboxStageEl.classList.add("dragging");
    lightboxState.lastClientX = e.clientX;
    lightboxState.lastClientY = e.clientY;
    e.preventDefault();
  });

  lightboxStageEl.addEventListener("wheel", e => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    lightboxSetZoom(lightboxState.zoom + dir * 0.25);
  }, { passive: false });
}

window.addEventListener("mousemove", e => {
  if (!lightboxState.dragging) return;
  const dx = e.clientX - lightboxState.lastClientX;
  const dy = e.clientY - lightboxState.lastClientY;
  lightboxState.panX += dx;
  lightboxState.panY += dy;
  lightboxState.lastClientX = e.clientX;
  lightboxState.lastClientY = e.clientY;
  lightboxApplyTransform();
});

window.addEventListener("mouseup", () => {
  if (lightboxState.dragging) {
    lightboxState.dragging = false;
    if (lightboxStageEl) lightboxStageEl.classList.remove("dragging");
  }
});

// Close on backdrop click (stage click does nothing)
if (lightboxRoot) {
  lightboxRoot.addEventListener("click", e => {
    if (e.target === lightboxBackdropEl) lightboxClose();
  });
}

// Keyboard shortcuts while the lightbox is open
document.addEventListener("keydown", e => {
  if (!lightboxRoot || !lightboxRoot.classList.contains("open")) return;
  if (e.key === "Escape") {
    lightboxClose();
  } else if (e.key === "ArrowRight") {
    lightboxNext();
  } else if (e.key === "ArrowLeft") {
    lightboxPrev();
  } else if (e.key === "+" || e.key === "=") {
    lightboxSetZoom(lightboxState.zoom + 0.4);
  } else if (e.key === "-" || e.key === "_") {
    lightboxSetZoom(lightboxState.zoom - 0.4);
  } else if (e.key === "0") {
    lightboxResetZoom();
  }
});
