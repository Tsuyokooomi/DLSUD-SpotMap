# SpotMap

SpotMap is a location-pinning web app for Dasmariñas, Cavite. It shows food spots, cafes, malls, and hangouts on an interactive map. Users browse pins, filter by category and tags, search by name, and save places to a personal list. Admins review and approve new submissions.

## Live Demo

- Frontend: deployed on Vercel
- Backend: deployed on Render

## Features

- Full-screen map centered on Dasmariñas, Cavite, built with Leaflet and OpenStreetMap
- Color-coded pins by category: Food, Cafe, Malls, Hangouts
- Place cards that show name, address, description, and tags
- Category filters and a tag filter panel (a place must match every checked tag)
- Search by name or tag
- Star and "to-go" toggles, plus a personal notes field per place
- Signup and login with JWT-based sessions
- Admin review queue: new submissions start as pending and go live once approved
- Comments on each place, with delete limited to the comment's author

## Tech Stack

**Frontend**
- HTML, CSS, JavaScript (no framework)
- Leaflet for the map
- Cloudinary for image uploads

**Backend**
- Node.js and Express
- MongoDB Atlas with Mongoose
- JWT for authentication, bcrypt for password hashing

## Project Structure

```
DLSUD-SpotMap/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── config.js      # API base URL and Cloudinary settings
│   ├── state.js        # session helpers (JWT, login state)
│   ├── api.js            # fetch wrapper for backend routes
│   └── app.js              # map rendering, filters, search, place cards
│
└── spotmap-backend/
    ├── server.js
    ├── middleware/
    │   └── auth.js              # requireAuth, requireAdmin
    ├── models/
    │   ├── User.js
    │   ├── Place.js
    │   ├── Comment.js
    │   └── SavedPlace.js
    └── routes/
        ├── auth.js               # signup, login
        ├── places.js              # create, read, update, delete, approve, reject
        ├── savedPlaces.js          # star and to-go lists
        └── comments.js              # post, read, delete
```

## API Overview

| Method | Route | Access |
|---|---|---|
| POST | `/api/auth/signup` | Public |
| POST | `/api/auth/login` | Public |
| GET | `/api/places` | Public (approved only); admins also see pending |
| GET | `/api/places/mine` | Logged-in user |
| POST | `/api/places` | Logged-in user (submits as pending, unless admin) |
| PUT `/`, DELETE `/api/places/:id` | Admin |
| PATCH `/api/places/:id/approve` or `/reject` | Admin |
| GET, POST `/api/saved` | Logged-in user |
| GET, POST `/api/comments/:placeId` | Public read, logged-in post |
| DELETE `/api/comments/:id` | Comment author |

## Running Locally

**Backend**

```bash
cd spotmap-backend
npm install
```

Create a `.env` file in `spotmap-backend/` with:

```
MONGODB_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_jwt_secret
PORT=5000
```

Then start the server:

```bash
npm run dev
```

**Frontend**

Open `index.html` in a browser, or serve the root folder with any static file server. Point `js/config.js` at your backend URL (`http://localhost:5000/api` for local development).

## Data Model

- **Place**: name, category (food, cafe, mall, hangout), tags, coordinates, address, description, images, status (pending, approved, rejected)
- **User**: email, hashed password, role (user or admin)
- **SavedPlace**: links a user to a place, with a type (star or to-go); a user can't save the same place twice under the same type
- **Comment**: linked to a place and a user

## Notes

- New submissions from regular users start as `pending` and need admin approval before they appear on the public map.
- The first admin account is set by editing the role field directly in MongoDB Atlas. There is no in-app option to promote a user, by design.
