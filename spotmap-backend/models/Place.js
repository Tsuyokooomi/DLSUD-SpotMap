const mongoose = require("mongoose");

const placeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: {
    type: String,
    required: true,
    enum: ["food", "cafe", "mall", "hangout"]
  },
  tags: [{ type: String }],
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  address: { type: String, required: true },
  description: { type: String, default: "" },
  imageUrl: { type: String, default: "" },
  menuImageUrls: [{ type: String, default: "" }],
  menuItems: [{
    name: { type: String, default: "" },
    price: { type: String, default: "" },
    imageUrl: { type: String, default: "" }
  }],
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "approved" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

module.exports = mongoose.model("Place", placeSchema);
