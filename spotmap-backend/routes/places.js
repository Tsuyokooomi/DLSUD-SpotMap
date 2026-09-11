const express = require("express");
const router = express.Router();
const Place = require("../models/Place");
const { requireAuth, requireAdmin } = require("../middleware/auth");

// GET /api/places - anyone can view all pins
router.get("/", async (req, res) => {
  try {
    const places = await Place.find();
    res.json(places);
  } catch (err) {
    res.status(500).json({ error: "Could not load places", details: err.message });
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

// POST /api/places - admin only
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, category, tags, lat, lng, address, description, imageUrl, menuImageUrl, menuItems } = req.body;

    const place = await Place.create({
      name, category, tags, lat, lng, address, description, imageUrl, menuImageUrl, menuItems,
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

module.exports = router;
