require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

app.use(cors());
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
