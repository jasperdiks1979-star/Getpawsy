#!/usr/bin/env python3
"""
Update Engine - Downloads and installs new ZIP updates
"""
import os
import shutil
import zipfile
import requests
from datetime import datetime
import json

LOG_FILE = "logs/update.log"
BACKUP_DIR = "backup"
ZIP_URL = "https://drive.google.com/uc?export=download&id=10UlT1mUkx24UZvK3tfahIvQu3k5hj7z9"
ZIP_NAME = "getpawsy_super_dashboard.zip"

def ensure_dirs():
    os.makedirs("logs", exist_ok=True)
    os.makedirs(BACKUP_DIR, exist_ok=True)

def log(message):
    ensure_dirs()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}\n"
    with open(LOG_FILE, "a") as f:
        f.write(log_entry)
    print(log_entry.strip())

def create_backup():
    timestamp = datetime.now().strftime("%Y%m%d-%H%M")
    backup_path = os.path.join(BACKUP_DIR, timestamp)
    
    log(f"Creating backup at {backup_path}")
    os.makedirs(backup_path, exist_ok=True)
    
    dirs_to_backup = ["engines", "tools", "dashboard", "config"]
    files_to_backup = ["version.json"]
    
    for dir_name in dirs_to_backup:
        if os.path.exists(dir_name):
            shutil.copytree(dir_name, os.path.join(backup_path, dir_name), dirs_exist_ok=True)
    
    for file_name in files_to_backup:
        if os.path.exists(file_name):
            shutil.copy2(file_name, backup_path)
    
    log(f"Backup created successfully")
    return backup_path

def download_zip():
    log(f"Downloading ZIP from {ZIP_URL}")
    try:
        response = requests.get(ZIP_URL, stream=True, timeout=60)
        response.raise_for_status()
        
        with open(ZIP_NAME, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        log(f"ZIP downloaded: {ZIP_NAME}")
        return True
    except Exception as e:
        log(f"Download failed: {e}")
        return False

def extract_zip():
    log(f"Extracting {ZIP_NAME}")
    try:
        with zipfile.ZipFile(ZIP_NAME, "r") as zip_ref:
            zip_ref.extractall(".")
        
        log("ZIP extracted successfully")
        return True
    except Exception as e:
        log(f"Extraction failed: {e}")
        return False

def update_version(new_version="1.0.0"):
    version_data = {
        "version": new_version,
        "name": "GetPawsy Super Dashboard",
        "description": "Full AI-powered dashboard, wizard, engines, optimizers, auto-update, auto-heal, and pipeline system.",
        "build": datetime.now().strftime("%Y-%m-%d")
    }
    
    with open("version.json", "w") as f:
        json.dump(version_data, f, indent=2)
    
    log(f"Updated version.json to {new_version}")

def cleanup():
    if os.path.exists(ZIP_NAME):
        os.remove(ZIP_NAME)
        log(f"Removed {ZIP_NAME}")

def run_update():
    log("=== Update Engine Started ===")
    
    backup_path = create_backup()
    log(f"Backup location: {backup_path}")
    
    if download_zip():
        if extract_zip():
            update_version()
            cleanup()
            log("=== Update Completed Successfully ===")
            return True
    
    log("=== Update Failed ===")
    return False

if __name__ == "__main__":
    run_update()
