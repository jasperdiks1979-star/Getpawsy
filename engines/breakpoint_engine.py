#!/usr/bin/env python3
"""
Breakpoint Engine - Creates hero breakpoints for all screen sizes
"""
import os
import json
from datetime import datetime

LOG_FILE = "logs/breakpoints.log"
CONFIG_FILE = "config/breakpoints.json"
HERO_DIR = "public/images/hero"

BREAKPOINTS = [
    {"name": "mobile-portrait", "width": 1080, "height": 1350},
    {"name": "mobile-story", "width": 1080, "height": 1920},
    {"name": "mobile-square", "width": 1080, "height": 1080},
    {"name": "tablet-landscape", "width": 1600, "height": 900},
    {"name": "desktop-hd", "width": 1920, "height": 1080},
    {"name": "desktop-ultrawide", "width": 2560, "height": 1080},
    {"name": "desktop-4k-ultrawide", "width": 3440, "height": 1440},
    {"name": "desktop-5k", "width": 3840, "height": 1600}
]

def ensure_dirs():
    os.makedirs("logs", exist_ok=True)
    os.makedirs("config", exist_ok=True)
    os.makedirs(HERO_DIR, exist_ok=True)

def log(message):
    ensure_dirs()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}\n"
    with open(LOG_FILE, "a") as f:
        f.write(log_entry)
    print(log_entry.strip())

def calculate_crop(source_width, source_height, target_width, target_height):
    source_ratio = source_width / source_height
    target_ratio = target_width / target_height
    
    if source_ratio > target_ratio:
        new_width = int(source_height * target_ratio)
        new_height = source_height
        x_offset = (source_width - new_width) // 2
        y_offset = 0
    else:
        new_width = source_width
        new_height = int(source_width / target_ratio)
        x_offset = 0
        y_offset = (source_height - new_height) // 2
    
    return {
        "crop_x": x_offset,
        "crop_y": y_offset,
        "crop_width": new_width,
        "crop_height": new_height,
        "target_width": target_width,
        "target_height": target_height
    }

def generate_breakpoint_config():
    log("Generating breakpoint configuration...")
    
    config = {
        "version": "1.0.0",
        "generated": datetime.now().isoformat(),
        "breakpoints": []
    }
    
    source_width = 1920
    source_height = 1080
    
    for bp in BREAKPOINTS:
        crop_info = calculate_crop(
            source_width, source_height,
            bp["width"], bp["height"]
        )
        
        breakpoint_config = {
            "name": bp["name"],
            "width": bp["width"],
            "height": bp["height"],
            "aspect_ratio": f"{bp['width']}:{bp['height']}",
            "css_query": f"@media (max-width: {bp['width']}px)",
            "crop": crop_info,
            "filename": f"hero-{bp['name']}-{bp['width']}x{bp['height']}.jpg"
        }
        
        config["breakpoints"].append(breakpoint_config)
        log(f"Generated config for {bp['name']}: {bp['width']}x{bp['height']}")
    
    return config

def save_config(config):
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)
    log(f"Configuration saved to {CONFIG_FILE}")

def generate_css_media_queries(config):
    css = """
/* Hero Responsive Breakpoints - Auto-generated */
.hero-section {
  width: 100%;
  position: relative;
  overflow: hidden;
}

.hero-section img {
  width: 100%;
  height: auto;
  object-fit: cover;
}

"""
    
    sorted_breakpoints = sorted(config["breakpoints"], key=lambda x: x["width"], reverse=True)
    
    for bp in sorted_breakpoints:
        css += f"""
/* {bp['name']} - {bp['width']}x{bp['height']} */
@media (max-width: {bp['width']}px) {{
  .hero-section {{
    aspect-ratio: {bp['width']} / {bp['height']};
  }}
}}
"""
    
    return css

def run_breakpoint_engine():
    log("=== Breakpoint Engine Started ===")
    
    config = generate_breakpoint_config()
    save_config(config)
    
    css = generate_css_media_queries(config)
    
    css_file = "config/hero-breakpoints.css"
    with open(css_file, "w") as f:
        f.write(css)
    log(f"CSS media queries saved to {css_file}")
    
    log(f"=== Breakpoint Engine Complete: {len(config['breakpoints'])} breakpoints configured ===")
    
    return {
        "breakpoints_count": len(config["breakpoints"]),
        "config_file": CONFIG_FILE,
        "css_file": css_file
    }

if __name__ == "__main__":
    result = run_breakpoint_engine()
    print(f"Breakpoints generated: {result}")
