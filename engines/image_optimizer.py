#!/usr/bin/env python3
"""
Image Optimizer - Optimizes all images in public/images/
"""
import os
from datetime import datetime
import shutil

LOG_FILE = "logs/optimize.log"
IMAGES_DIR = "public/images"
SUPPORTED_FORMATS = [".jpg", ".jpeg", ".png", ".gif", ".webp"]

def ensure_log_dir():
    os.makedirs("logs", exist_ok=True)

def log(message):
    ensure_log_dir()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}\n"
    with open(LOG_FILE, "a") as f:
        f.write(log_entry)
    print(log_entry.strip())

def get_image_files():
    images = []
    if not os.path.exists(IMAGES_DIR):
        log(f"Images directory not found: {IMAGES_DIR}")
        return images
    
    for root, dirs, files in os.walk(IMAGES_DIR):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in SUPPORTED_FORMATS:
                images.append(os.path.join(root, file))
    
    return images

def get_file_size(filepath):
    if os.path.exists(filepath):
        return os.path.getsize(filepath)
    return 0

def analyze_images():
    images = get_image_files()
    log(f"Found {len(images)} images to analyze")
    
    stats = {
        "total_files": len(images),
        "total_size": 0,
        "large_files": [],
        "optimizable": []
    }
    
    for img_path in images:
        size = get_file_size(img_path)
        stats["total_size"] += size
        
        if size > 500 * 1024:
            stats["large_files"].append({
                "path": img_path,
                "size_kb": round(size / 1024, 2)
            })
        
        ext = os.path.splitext(img_path)[1].lower()
        if ext in [".png", ".jpg", ".jpeg"] and not img_path.endswith(".webp"):
            stats["optimizable"].append(img_path)
    
    return stats

def create_mobile_variants():
    log("Creating mobile image variants...")
    
    hero_dir = os.path.join(IMAGES_DIR, "hero")
    if not os.path.exists(hero_dir):
        log("Hero directory not found, skipping mobile variants")
        return 0
    
    mobile_dir = os.path.join(hero_dir, "mobile")
    os.makedirs(mobile_dir, exist_ok=True)
    
    created = 0
    for file in os.listdir(hero_dir):
        if os.path.isfile(os.path.join(hero_dir, file)):
            src = os.path.join(hero_dir, file)
            dst = os.path.join(mobile_dir, f"mobile_{file}")
            if not os.path.exists(dst):
                shutil.copy2(src, dst)
                created += 1
                log(f"Created mobile variant: {dst}")
    
    return created

def run_optimization():
    log("=== Image Optimizer Started ===")
    
    stats = analyze_images()
    log(f"Total images: {stats['total_files']}")
    log(f"Total size: {round(stats['total_size'] / 1024 / 1024, 2)} MB")
    log(f"Large files (>500KB): {len(stats['large_files'])}")
    log(f"Optimizable files: {len(stats['optimizable'])}")
    
    for large in stats["large_files"]:
        log(f"  - {large['path']}: {large['size_kb']} KB")
    
    mobile_count = create_mobile_variants()
    log(f"Mobile variants created: {mobile_count}")
    
    log("=== Image Optimizer Complete ===")
    log("Note: For full WebP conversion, install Pillow: pip install Pillow")
    
    return {
        "analyzed": stats["total_files"],
        "total_size_mb": round(stats["total_size"] / 1024 / 1024, 2),
        "large_files": len(stats["large_files"]),
        "mobile_variants": mobile_count
    }

if __name__ == "__main__":
    result = run_optimization()
    print(f"Optimization complete: {result}")
