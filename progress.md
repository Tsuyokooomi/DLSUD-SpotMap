# SpotMap — Progress Notes

A location-pinning web app for food, cafes, malls, and hangouts, built with
Leaflet + OpenStreetMap, a Node/Express + MongoDB Atlas backend, and a plain
HTML/CSS/JS frontend (deploy target: GitHub Pages + Render).

## Stack

- **Map:** Leaflet + OpenStreetMap (no billing account needed)
- **Frontend:** Plain HTML/CSS/JS → GitHub Pages
- **Backend:** Node.js + Express → Render
- **Database:** MongoDB Atlas (free tier)
- **Auth:** JWT, bcrypt-hashed passwords, admin vs. regular user roles

## Done

### Frontend (visual layer)
- Full-screen Leaflet map centered on Dasmariñas, Cavite
- Custom category-colored pins (Food / Cafe / Malls / Hangouts)
- Ticket-stub-style place card: slides in on pin click, shows name, address,
  description, tags
- Category filter chips + a separate Tags filter panel (AND logic — a place
  must match every checked tag)
- Search by name or tag, results in a dropdown (not a straight jump)
- Star / To-go toggle buttons and a local notes field on each place card
- Fixed a clipping bug (tag panel now uses fixed positioning) and a bug where
  the Tags button was mistakenly captured by the category-chip click handler

### Backend
- Express server (`server.js`) connected to MongoDB Atlas
  - Had to switch from `mongodb+srv://` to a direct (non-SRV) connection
    string — Node's DNS lookup for SRV records was being blocked locally
    (nslookup worked, Node didn't), so this workaround is now permanent.
    Connection string lives in `.env` → `MONGODB_URI`.
- Models: `User`, `Place`, `Comment`, `SavedPlace`
  - `Place.category` is a locked enum: `food | cafe | mall | hangout`
  - `SavedPlace` has a unique index on `(user, place, type)` so a user can't
    double-save the same place under the same type
- Routes, all mounted under `/api`:
  - `POST /auth/signup`, `POST /auth/login` → returns `{ token, user }`
  - `GET /places`, `GET /places/:id` → public
  - `POST /places`, `PUT /places/:id`, `DELETE /places/:id` → admin only
  - `GET /saved`, `POST /saved`, `DELETE /saved/:placeId/:type` → logged-in users
  - `GET /comments/:placeId`, `POST /comments/:placeId` → logged-in to post
  - `DELETE /comments/:id` → only the comment's author
- Verified end-to-end with Thunder Client: signup, login, pin creation,
  401 (no token) and 403 (non-admin token) both confirmed working
- First admin account created (role flipped manually in Atlas — there's no
  in-app "make admin" route by design)

### Frontend ↔ Backend integration (just started)
- `js/config.js` added: holds `API_BASE`, currently pointed at
  `http://localhost:5000/api` (swap to the Render URL once deployed)

## In Progress / Next Up

Frontend still runs on **mock data + localStorage** (`js/data.js`) for
places, stars, to-go, and comments. That needs to be replaced:

1. `js/state.js` — auth session helpers (store/read JWT + user in
   localStorage, `isLoggedIn()`, `isAdmin()`, `authHeaders()`)
2. `js/api.js` — thin fetch wrapper for all the routes above
3. `index.html` — add login/signup modal + admin "create pin" modal markup
4. `css/style.css` — style those modals to match the existing ticket-card look
5. `js/app.js` — rewrite to:
   - load `PLACES` from `GET /places` instead of the mock array
   - wire the Login button to the auth modal (signup/login, store session,
     show logged-in state)
   - wire the Admin button to the create-pin modal (only usable when
     `isAdmin()`)
   - swap star/to-go/comments from localStorage to the `/saved` and
     `/comments` routes, keyed by `place._id` (not the old mock `place.id`)
6. Delete `js/data.js` once the above is live, or trim it to just the tags
   list fallback if useful

## File Structure

```
Project1/
├── index.html
├── progress.md
├── css/
│   └── style.css
├── js/
│   ├── config.js        # API_BASE URL — new, points at localhost:5000/api for now
│   ├── data.js           # mock PLACES + localStorage keys — to be replaced
│   ├── app.js             # map, pins, filters, search, cards — still on mock data
│   ├── state.js           # NOT YET ADDED — auth session helpers
│   └── api.js              # NOT YET ADDED — fetch wrapper for backend routes
│
└── spotmap-backend/
    ├── .env                    # MONGODB_URI, JWT_SECRET — never committed
    ├── .gitignore
    ├── package.json
    ├── package-lock.json
    ├── server.js                # connects to MongoDB, mounts all /api routes
    ├── middleware/
    │   └── auth.js               # requireAuth, requireAdmin
    ├── models/
    │   ├── User.js                 # email, hashed password, role
    │   ├── Place.js                 # name, category (enum), tags, lat/lng, address, description
    │   ├── Comment.js                 # place ref, user ref, text
    │   └── SavedPlace.js               # user ref, place ref, type (star | togo), unique index
    └── routes/
        ├── auth.js                      # POST /signup, POST /login
        ├── places.js                     # GET/POST/PUT/DELETE (create/edit/delete = admin only)
        ├── savedPlaces.js                  # GET/POST/DELETE, all require login
        └── comments.js                      # GET public, POST requires login, DELETE = author only
```

Note: `spotmap-backend/node_modules/` exists locally (from `npm install`) but
is git-ignored, so it isn't shown above.

## Known Gotchas (worth remembering)

- Windows PowerShell blocks `npm` by default —
  `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`
  (as Admin) fixes it, or just use Command Prompt.
- MongoDB Atlas never re-shows a database user's password after creation —
  save it immediately or reset it via Database Access → Edit → Edit Password.
- Render won't read the local `.env` file — `MONGODB_URI` (and any other
  secrets) need to be re-added as environment variables in Render's dashboard
  at deploy time.
- Atlas free-tier clusters pause after inactivity — check for a "Resume"
  button if a connection suddenly fails after a while.
