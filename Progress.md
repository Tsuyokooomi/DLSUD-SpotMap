# SpotMap — Progress Notes

A location-pinning web app for food, cafes, malls, and hangouts, built with
Leaflet + OpenStreetMap, a Node/Express + MongoDB Atlas backend, and a plain
HTML/CSS/JS frontend (deploy target: Vercel + Render).

## Stack

- **Map:** Leaflet + OpenStreetMap (no billing account needed)
- **Frontend:** Plain HTML/CSS/JS → Vercel
- **Backend:** Node.js + Express → Render
- **Database:** MongoDB Atlas (free tier)
- **Auth:** JWT, bcrypt-hashed passwords, admin vs. regular user roles
- **Image uploads:** Cloudinary (unsigned presets, free tier)

## Completed Features

### Map & Pins
- Full-screen Leaflet map centered on Dasmariñas, Cavite
- Custom category-colored pins (Food / Cafe / Malls / Hangouts)
- Place cards: slide in on pin click, show name, address, description, tags, photo, menu

### Filters & Search
- Category filter chips (All / Food / Cafe / Malls / Hangouts)
- Tag filter panel with AND logic (place must match all checked tags)
- Search by name or tag (desktop in topbar, mobile below filters)
- Refresh Locations button for manual reload

### User Features
- Signup / Login modal with JWT sessions
- Star and To-go toggles (saved per user)
- Comments / notes on each place (author can delete their own)
- Suggest Spot: any logged-in user can submit a new place (goes to "pending")
- My Suggestions panel: users see their own submissions with status badges

### Admin Features
- Admin-only "Add Spot" creates immediately approved
- Admin-only "Review Pending" panel shows all pending submissions
- Each pending item shows: name, category, address, description, coordinates, photo, menu image, menu items
- Approve / Reject buttons on each pending item
- "View" button pans map to the spot and opens the detail card
- Rejected spots never appear on the public map

### Image & Menu Uploads
- Spot photo upload via Cloudinary (drag/drop or click)
- Multiple full menu image uploads (select or drag several images; gallery preview with per-image removal, render as a stacked list on cards)
- Individual menu items with name, price, optional photo
- All images stored as Cloudinary URLs in MongoDB

### Location Picking
- "Use My Current Location" button uses browser GPS
- "Drag Pin on Map" mode lets you place the pin manually
- Floating banner shows coordinates while dragging
- Confirm / Cancel buttons to finalize

### Mobile Responsiveness
- Hamburger menu (☰) replaces topbar buttons on phones
- Slide-out navigation drawer with all actions
- Mobile search bar below filters, overlays the map
- Tag filter panel repositioned to stay on-screen (fixed positioning on mobile)
- Full-width bottom-sheet place cards and review panels on mobile
- Modals become full-screen on mobile

### Backend
- Express server connected to MongoDB Atlas
- Models: User, Place, Comment, SavedPlace
- Place has status field: pending → approved | rejected
- Routes under `/api`:
  - `POST /auth/signup`, `POST /auth/login`
  - `GET /places` (public = approved only; admins also see pending)
  - `GET /places/mine` (logged-in user's own submissions)
  - `POST /places` (logged-in users → pending; admins → approved)
  - `PUT /places/:id`, `DELETE /places/:id` (admin only)
  - `PATCH /places/:id/approve`, `/reject` (admin only)
  - `GET/POST/DELETE /saved` (logged-in)
  - `GET/POST/DELETE /comments/:placeId`
- Cache-busting added (`_t=` timestamp + `cache: no-store`) to prevent stale data

### Frontend ↔ Backend
- `js/config.js` holds `API_BASE` (Render URL for production)
- `js/state.js` handles JWT storage in localStorage
- `js/api.js` thin fetch wrapper with auth headers
- `js/app.js` handles all UI: map, pins, filters, search, cards, modals, panels

## Deployment

- **Frontend:** Vercel (static site from root folder)
- **Backend:** Render (Node.js service)
- Environment variables on Render: `MONGODB_URI`, `JWT_SECRET`

## File Structure

```
DLSUD-SpotMap/
├── index.html
├── progress.md
├── css/
│   └── style.css
├── js/
│   ├── config.js        # API_BASE, Cloudinary config
│   ├── state.js         # JWT + user session helpers
│   ├── api.js           # fetch wrapper with auth headers
│   ├── data.js          # fallback mock PLACES (used if backend empty)
│   └── app.js           # map, pins, filters, search, cards, modals, panels
│
└── spotmap-backend/
    ├── .env                    # MONGODB_URI, JWT_SECRET — never committed
    ├── .gitignore
    ├── package.json
    ├── server.js                # Express + CORS + JSON + routes
    ├── middleware/
    │   └── auth.js               # requireAuth, requireAdmin
    ├── models/
    │   ├── User.js                 # email, passwordHash, role
    │   ├── Place.js                 # name, category, tags, lat, lng, address, description, imageUrl, menuImageUrls, menuItems, status, createdBy
    │   ├── Comment.js               # place, user, text, createdAt
    │   └── SavedPlace.js            # user, place, type (star/togo), unique index
    └── routes/
        ├── auth.js                  # POST /signup, POST /login
        ├── places.js                # GET / POST / PUT / DELETE / PATCH approve/reject
        ├── savedPlaces.js           # GET / POST / DELETE
        └── comments.js              # GET / POST / DELETE
```

## Known Gotchas

- Windows PowerShell may block `npm` — run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` as Admin.
- MongoDB Atlas free tier clusters pause after inactivity — look for a "Resume" button if connections fail.
- Render doesn't read local `.env` — add secrets in Render dashboard.
- Rejected spots never appear on the map (backend filters them out).
- Clear browser cache or use "Refresh Locations" if places don't appear after a deploy.

## Not Yet Implemented

- Email verification on signup (deferred)
- Password reset flow (deferred)
- In-app admin promotion (role must be set in MongoDB Atlas)
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
