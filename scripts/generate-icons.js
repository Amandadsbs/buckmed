/**
 * scripts/generate-icons.js
 * Generates all PWA icon sizes from a source image.
 * 
 * Pre-requisites:
 *   npm install --save-dev sharp
 *
 * Usage:
 *   node scripts/generate-icons.js
 */

const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const SOURCE = path.join(__dirname, "..", "public", "icon-source.png");
const OUTPUT = path.join(__dirname, "..", "public", "icons");
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

if (!fs.existsSync(SOURCE)) {
    console.error("❌ Missing source image: public/icon-source.png");
    console.error("   Place your 512×512 source icon there and run again.");
    process.exit(1);
}

fs.mkdirSync(OUTPUT, { recursive: true });

(async () => {
    for (const size of SIZES) {
        const dest = path.join(OUTPUT, `icon-${size}x${size}.png`);
        await sharp(SOURCE)
            .resize(size, size, { fit: "cover" })
            .png()
            .toFile(dest);
        console.log(`  ✅ Generated ${size}×${size} → ${dest}`);
    }
    console.log("\n🎉 All PWA icons generated successfully!");
})();
