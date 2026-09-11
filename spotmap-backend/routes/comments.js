const express = require("express");
const router = express.Router();
const Comment = require("../models/Comment");
const { requireAuth } = require("../middleware/auth");

// GET /api/comments/:placeId - anyone can read comments on a place
router.get("/:placeId", async (req, res) => {
  try {
    const comments = await Comment.find({ place: req.params.placeId })
      .populate("user", "email")
      .sort({ createdAt: -1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: "Could not load comments", details: err.message });
  }
});

// POST /api/comments/:placeId - logged-in users can add a comment
router.post("/:placeId", requireAuth, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Comment text is required" });
    }

    const comment = await Comment.create({
      place: req.params.placeId,
      user: req.user.id,
      text: text.trim()
    });

    const populated = await comment.populate("user", "email");
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: "Could not add comment", details: err.message });
  }
});

// DELETE /api/comments/:id - only the comment's author can delete it
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ error: "Comment not found" });

    if (comment.user.toString() !== req.user.id) {
      return res.status(403).json({ error: "You can only delete your own comments" });
    }

    await comment.deleteOne();
    res.json({ message: "Comment deleted" });
  } catch (err) {
    res.status(500).json({ error: "Could not delete comment", details: err.message });
  }
});

module.exports = router;
