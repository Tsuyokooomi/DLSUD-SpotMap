const express = require("express");
const router = express.Router();
const Place = require("../models/Place");
const { requireAuth, requireAdmin } = require("../middleware/auth");

// GET /api/places - anyone can view approved pins (admins see all)
router.get("/", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let isAdmin = false;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const jwt = require("jsonwebtoken");
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        isAdmin = payload.role === "admin";
      } catch {}
    }

    // Admins see approved + pending; regular users see only approved.
    // Rejected spots are never shown on the map.
    const filter = isAdmin ? { status: { $in: ["approved", "pending"] } } : { status: "approved" };
    const places = await Place.find(filter);
    res.json(places);
  } catch (err) {
    res.status(500).json({ error: "Could not load places", details: err.message });
  }
});

// GET /api/places/mine - logged-in user's own suggestions (pending, approved, rejected)
router.get("/mine", requireAuth, async (req, res) => {
  try {
    const places = await Place.find({ createdBy: req.user.id });
    res.json(places);
  } catch (err) {
    res.status(500).json({ error: "Could not load your suggestions", details: err.message });
  }
});

// GET /api/places/:id - anyone can view one pin
router.get("/:id", async (req, res) => {

  try {
    const place = await Place.findById(req.params.id);
    if (!place) return res.status(404).json({ error: "Place not found" });
    res.json(place);
  } catch (err) {
    res.status(500).json({ error: "Could not load place", details: err.message });
  }
});

// POST /api/places - authenticated users can suggest (pending), admins create approved spots
router.post("/", requireAuth, async (req, res) => {
  try {
    const { name, category, tags, lat, lng, address, description, imageUrl, menuImageUrl, menuItems } = req.body;
    const isAdmin = req.user.role === "admin";

    const place = await Place.create({
      name, category, tags, lat, lng, address, description, imageUrl, menuImageUrl, menuItems,
      status: isAdmin ? "approved" : "pending",
      createdBy: req.user.id
    });

    res.status(201).json(place);
  } catch (err) {
    res.status(500).json({ error: "Could not create place", details: err.message });
  }
});

// PUT /api/places/:id - admin only
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const place = await Place.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!place) return res.status(404).json({ error: "Place not found" });
    res.json(place);
  } catch (err) {
    res.status(500).json({ error: "Could not update place", details: err.message });
  }
});

// DELETE /api/places/:id - admin only
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const place = await Place.findByIdAndDelete(req.params.id);
    if (!place) return res.status(404).json({ error: "Place not found" });
    res.json({ message: "Place deleted" });
  } catch (err) {
    res.status(500).json({ error: "Could not delete place", details: err.message });
  }
});

// PATCH /api/places/:id/approve - admin only, approve a pending spot
router.patch("/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  try {
    const place = await Place.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { new: true }
    );
    if (!place) return res.status(404).json({ error: "Place not found" });
    res.json(place);
  } catch (err) {
    res.status(500).json({ error: "Could not approve place", details: err.message });
  }
});

// PATCH /api/places/:id/reject - admin only, reject a pending spot
router.patch("/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  try {
    const place = await Place.findByIdAndUpdate(
      req.params.id,
      { status: "rejected" },
      { new: true }
    );
    if (!place) return res.status(404).json({ error: "Place not found" });
    res.json(place);
  } catch (err) {
    res.status(500).json({ error: "Could not reject place", details: err.message });
  }
});

module.exports = router;
