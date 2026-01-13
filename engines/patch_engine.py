#!/usr/bin/env python3
"""
Patch Engine - Auto-patches HTML and CSS files
"""
import os
import re
from datetime import datetime

LOG_FILE = "logs/patcher.log"
CSS_FILE = "public/css/style.css"
HTML_FILES = ["views/index.ejs", "views/product.ejs", "views/collections.ejs"]

def ensure_log_dir():
    os.makedirs("logs", exist_ok=True)

def log(message):
    ensure_log_dir()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}\n"
    with open(LOG_FILE, "a") as f:
        f.write(log_entry)
    print(log_entry.strip())

def patch_hero_ratio(css_content):
    patches_applied = 0
    
    if "object-fit: cover" not in css_content:
        css_content = css_content.replace(
            ".hero-section img {",
            ".hero-section img {\n  object-fit: cover;"
        )
        patches_applied += 1
        log("Patched: Added object-fit: cover to hero images")
    
    if "aspect-ratio" not in css_content:
        hero_pattern = r"(\.hero-section\s*\{[^}]*)"
        if re.search(hero_pattern, css_content):
            css_content = re.sub(
                hero_pattern,
                r"\1\n  aspect-ratio: 16/9;",
                css_content
            )
            patches_applied += 1
            log("Patched: Added aspect-ratio to hero section")
    
    return css_content, patches_applied

def patch_text_overlay(css_content):
    patches_applied = 0
    
    if ".hero-content" in css_content:
        if "text-align: center" not in css_content:
            css_content = css_content.replace(
                ".hero-content {",
                ".hero-content {\n  text-align: center;"
            )
            patches_applied += 1
            log("Patched: Centered hero text overlay")
    
    return css_content, patches_applied

def patch_responsive_fixes(css_content):
    patches_applied = 0
    
    mobile_hero = """
@media (max-width: 768px) {
  .hero-section {
    min-height: 400px;
  }
  .hero-content h1 {
    font-size: 1.8rem;
  }
  .hero-content p {
    font-size: 1rem;
  }
}
"""
    
    if "@media (max-width: 768px)" not in css_content or ".hero-section" not in css_content:
        css_content += "\n" + mobile_hero
        patches_applied += 1
        log("Patched: Added mobile responsive hero styles")
    
    return css_content, patches_applied

def patch_css():
    if not os.path.exists(CSS_FILE):
        log(f"CSS file not found: {CSS_FILE}")
        return 0
    
    with open(CSS_FILE, "r") as f:
        content = f.read()
    
    original_content = content
    total_patches = 0
    
    content, patches = patch_hero_ratio(content)
    total_patches += patches
    
    content, patches = patch_text_overlay(content)
    total_patches += patches
    
    content, patches = patch_responsive_fixes(content)
    total_patches += patches
    
    if content != original_content:
        with open(CSS_FILE, "w") as f:
            f.write(content)
        log(f"CSS file updated with {total_patches} patches")
    else:
        log("No CSS patches needed")
    
    return total_patches

def patch_html():
    patches_applied = 0
    
    for html_file in HTML_FILES:
        if not os.path.exists(html_file):
            continue
        
        with open(html_file, "r") as f:
            content = f.read()
        
        log(f"Skipping HTML patches to preserve EJS syntax in {html_file}")
    
    return patches_applied

def run_patches():
    log("=== Patch Engine Started ===")
    
    css_patches = patch_css()
    html_patches = patch_html()
    
    total = css_patches + html_patches
    log(f"=== Patch Engine Complete: {total} patches applied ===")
    
    return {
        "css_patches": css_patches,
        "html_patches": html_patches,
        "total": total
    }

if __name__ == "__main__":
    result = run_patches()
    print(f"Total patches applied: {result['total']}")
