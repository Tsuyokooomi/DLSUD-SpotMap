const mongoose = require("mongoose");

const savedPlaceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  place: { type: mongoose.Schema.Types.ObjectId, ref: "Place", required: true },
  type: { type: String, enum: ["star", "togo"], required: true }
}, { timestamps: true });

// Stop the same user from saving the same place twice under the same type.
savedPlaceSchema.index({ user: 1, place: 1, type: 1 }, { unique: true });

module.exports = mongoose.model("SavedPlace", savedPlaceSchema);
