const express = require("express");
const router = express.Router();
const SavedPlace = require("../models/SavedPlace");
const { requireAuth } = require("../middleware/auth");

// GET /api/saved - get the logged-in user's starred and to-go places
router.get("/", requireAuth, async (req, res) => {
  try {
    const saved = await SavedPlace.find({ user: req.user.id }).populate("place");
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: "Could not load saved places", details: err.message });
  }
});

// POST /api/saved - star or mark a place to-go
// body: { placeId, type: "star" | "togo" }
router.post("/", requireAuth, async (req, res) => {
  try {
    const { placeId, type } = req.body;

    if (!["star", "togo"].includes(type)) {
      return res.status(400).json({ error: "type must be 'star' or 'togo'" });
    }

    const saved = await SavedPlace.create({
      user: req.user.id,
      place: placeId,
      type
    });

    res.status(201).json(saved);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "Already saved" });
    }
    res.status(500).json({ error: "Could not save place", details: err.message });
  }
});

// DELETE /api/saved/:placeId/:type - remove a star or to-go mark
router.delete("/:placeId/:type", requireAuth, async (req, res) => {
  try {
    const { placeId, type } = req.params;

    await SavedPlace.findOneAndDelete({
      user: req.user.id,
      place: placeId,
      type
    });

    res.json({ message: "Removed" });
  } catch (err) {
    res.status(500).json({ error: "Could not remove", details: err.message });
  }
});

module.exports = router;
