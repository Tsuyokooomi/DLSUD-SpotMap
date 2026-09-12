/* ------------------------------------------------------------------
 * One-time migration: move legacy singular `menuImageUrl` values into
 * the new `menuImageUrls` array field.
 *
 * The Place model + routes were already updated to use
 * `menuImageUrls` (array of strings). Existing documents that were
 * created with the old singular field still store `menuImageUrl`.
 * Run this ONCE, then existing saved menu images keep working.
 *
 * Usage:
 *   1. Make sure your .env has MONGODB_URI pointing at your database
 *      (use the same one the running app uses).
 *   2. From the spotmap-backend folder:
 *        node migration-menuImageUrl-to-array.js
 *   3. Optional dry-run first:
 *        DRY_RUN=1 node migration-menuImageUrl-to-array.js
 * ------------------------------------------------------------------ */
require("dotenv").config();
const mongoose = require("mongoose");

const DRY_RUN = ["1", "true", "yes"].includes(String(process.env.DRY_RUN || "").toLowerCase());

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set. Add it to .env (or export it) and try again.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected to MongoDB (${DRY_RUN ? "DRY RUN — no changes will be saved" : "LIVE"})`);

  const collection = mongoose.connection.collection("places");
  const cursor = collection.find({
    menuImageUrl: { $exists: true, $ne: "" }
  });

  let updated = 0;
  let skipped = 0;
  let docs = [];

  // NOTE: cursor.forEach can't be used with await on older mongo drivers;
  // collect with toArray for simplicity.
  docs = await cursor.toArray();

  for (const doc of docs) {
    const oldUrl = doc.menuImageUrl;
    const existing = Array.isArray(doc.menuImageUrls) ? doc.menuImageUrls : [];
    const push = [];

    if (oldUrl && !existing.includes(oldUrl)) {
      push.push(oldUrl);
    }

    if (DRY_RUN) {
      console.log(`[would-update] ${doc.name || "(unnamed)"}: ${oldUrl} -> menuImageUrls`);
      updated++;
      continue;
    }

    if (push.length > 0) {
      await collection.updateOne(
        { _id: doc._id },
        { $push: { menuImageUrls: { $each: push } } }
      );
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(
    `\nDone. ${updated} document(s) ${DRY_RUN ? "would be" : "were"} updated, ` +
    `${skipped} skipped.`
  );

  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
