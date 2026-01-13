#!/usr/bin/env python3
"""
Publish Engine - Patches index.html with picture tags and publishes hero
"""
import os
import re
from datetime import datetime

LOG_FILE = "logs/publish.log"
INDEX_FILE = "views/index.ejs"
CSS_FILE = "public/css/style.css"
HERO_DIR = "public/images/hero"

def ensure_log_dir():
    os.makedirs("logs", exist_ok=True)

def log(message):
    ensure_log_dir()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}\n"
    with open(LOG_FILE, "a") as f:
        f.write(log_entry)
    print(log_entry.strip())

def get_hero_images():
    images = []
    if os.path.exists(HERO_DIR):
        for file in os.listdir(HERO_DIR):
            if file.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                images.append(file)
    return sorted(images)

def generate_picture_tag(images):
    if not images:
        return None
    
    picture_html = '<picture class="hero-picture">\n'
    
    breakpoints = [
        (3840, "5k"),
        (3440, "4k-ultrawide"),
        (2560, "ultrawide"),
        (1920, "desktop"),
        (1600, "tablet"),
        (1080, "mobile")
    ]
    
    for max_width, size_name in breakpoints:
        matching = [img for img in images if size_name in img.lower() or str(max_width) in img]
        if matching:
            img_path = f"/public/images/hero/{matching[0]}"
            picture_html += f'  <source media="(max-width: {max_width}px)" srcset="{img_path}">\n'
    
    default_image = images[0] if images else "hero-default.jpg"
    picture_html += f'  <img src="/public/images/hero/{default_image}" alt="GetPawsy Hero" loading="lazy">\n'
    picture_html += '</picture>'
    
    return picture_html

def patch_index_with_picture():
    log("Skipping picture tag insertion - using CSS background images instead")
    return False

def patch_styles():
    if not os.path.exists(CSS_FILE):
        log(f"CSS file not found: {CSS_FILE}")
        return False
    
    with open(CSS_FILE, "r") as f:
        content = f.read()
    
    picture_styles = """
/* Picture element styles for responsive hero */
.hero-picture {
  display: block;
  width: 100%;
  height: 100%;
}

.hero-picture img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.hero-picture source {
  display: none;
}
"""
    
    if ".hero-picture" not in content:
        content += "\n" + picture_styles
        with open(CSS_FILE, "w") as f:
            f.write(content)
        log("Added picture element styles to CSS")
        return True
    
    log("Picture styles already exist in CSS")
    return False

def publish_hero():
    log("Publishing hero section...")
    
    if not os.path.exists(HERO_DIR):
        os.makedirs(HERO_DIR, exist_ok=True)
        log(f"Created hero directory: {HERO_DIR}")
    
    images = get_hero_images()
    log(f"Found {len(images)} hero images")
    
    return len(images)

def run_publish():
    log("=== Publish Engine Started ===")
    
    hero_count = publish_hero()
    index_patched = patch_index_with_picture()
    styles_patched = patch_styles()
    
    result = {
        "hero_images": hero_count,
        "index_patched": index_patched,
        "styles_patched": styles_patched,
        "status": "SUCCESS" if hero_count > 0 else "NO_IMAGES"
    }
    
    log(f"=== Publish Engine Complete ===")
    log(f"Hero images: {hero_count}")
    log(f"Index patched: {index_patched}")
    log(f"Styles patched: {styles_patched}")
    
    return result

if __name__ == "__main__":
    result = run_publish()
    print(f"Publish result: {result}")
