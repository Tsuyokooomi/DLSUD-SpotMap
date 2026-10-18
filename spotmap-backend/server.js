require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// Only allow requests from approved sites.
// Set ALLOWED_ORIGINS on Render, e.g. https://your-app.vercel.app
// Separate several origins with commas.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5500,http://127.0.0.1:5500")
  .split(",")
  .map(o => o.trim().replace(/\/+$/, "")) // strip trailing slashes (browsers never send them)
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Allow tools with no Origin header (curl, health checks).
    if (!origin || allowedOrigins.includes(origin.replace(/\/+$/, ""))) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  }
}));
app.use(express.json());

// Connect to MongoDB using the connection string in .env
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB connection failed:", err.message));

// Route groups
app.use("/api/auth", require("./routes/auth"));
app.use("/api/places", require("./routes/places"));
app.use("/api/saved", require("./routes/savedPlaces"));
app.use("/api/comments", require("./routes/comments"));

// Basic health check route, to confirm the server is running
app.get("/", (req, res) => {
  res.json({ status: "SpotMap API is running" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
