import os, shutil, json

print("🐾 Installing GetPawsy HERO PACK v1…")

# =========================================================
# 1️⃣ Directories
# =========================================================

TARGET_DIR = "public/images/hero"

os.makedirs(TARGET_DIR, exist_ok=True)

# =========================================================
# 2️⃣ Import ZIP + extract images
# =========================================================

ZIP_FILE = "hero_pack.zip"

if not os.path.exists(ZIP_FILE):
    print("❌ ZIP not found. Please upload hero_pack.zip to root.")
    exit()

print("📦 Extracting hero images…")

import zipfile
with zipfile.ZipFile(ZIP_FILE, "r") as z:
    z.extractall(TARGET_DIR)

print("✔ Images extracted into:", TARGET_DIR)

# =========================================================
# 3️⃣ Generate breakpoint JSON for your dashboard
# =========================================================

BREAKPOINTS = {
    "mobile":  {"min": 0, "max": 600,  "file": "/images/hero/mobile.png"},
    "tablet":  {"min": 601, "max": 1024, "file": "/images/hero/tablet.png"},
    "desktop": {"min": 1025, "max": 1920, "file": "/images/hero/desktop.png"},
    "ultra":   {"min": 1921, "max": 4000, "file": "/images/hero/ultrawide.png"}
}

with open("config/hero_breakpoints.json", "w") as f:
    json.dump(BREAKPOINTS, f, indent=4)

print("✔ Breakpoints registered.")

# =========================================================
# 4️⃣ Update index.html automatically
# =========================================================

HTML_FILE = "views/index.html"

if not os.path.exists(HTML_FILE):
    print("⚠ index.html not found, skipping HTML patch")
else:
    print("🛠 Patching index.html hero section…")

    with open(HTML_FILE, "r") as f:
        html = f.read()

    # Remove old hero image references
    import re
    html = re.sub(r'<img[^>]*class="hero-image"[^>]*>', "", html)

    # Insert new hero container
    HERO_BLOCK = """
    <picture id="hero-auto">
        <source media="(min-width:1921px)" srcset="/images/hero/ultrawide.png">
        <source media="(min-width:1025px)" srcset="/images/hero/desktop.png">
        <source media="(min-width:601px)" srcset="/images/hero/tablet.png">
        <img src="/images/hero/mobile.png" class="hero-image" alt="GetPawsy Hero">
    </picture>
    """

    html = html.replace("<!-- HERO_SECTION -->", HERO_BLOCK)

    with open(HTML_FILE, "w") as f:
        f.write(html)

    print("✔ index.html updated and optimized.")

# =========================================================
# 5️⃣ Update CSS for responsive hero
# =========================================================

CSS_FILE = "public/styles.css"

CSS_SNIPPET = """
/* --- HERO PACK v1 CSS --- */
.hero-image {
    width: 100%;
    height: auto;
    display: block;
}

#hero-auto {
    width: 100%;
    overflow: hidden;
}

@media (min-width: 1025px) {
    #hero-auto img {
        object-fit: cover;
        height: 480px;
    }
}
"""

if os.path.exists(CSS_FILE):
    with open(CSS_FILE, "a") as f:
        f.write("\n" + CSS_SNIPPET)
    print("✔ CSS updated.")
else:
    print("⚠ styles.css not found, skipping CSS")

# =========================================================
# 6️⃣ Final message
# =========================================================

print("🎉 HERO PACK v1 installation complete!")
print("👉 Your hero images are now fully responsive, optimized, and auto-managed.")
