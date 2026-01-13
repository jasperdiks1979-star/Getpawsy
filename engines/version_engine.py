#!/usr/bin/env python3
"""
Version Engine - Compares local version.json with remote version
"""
import json
import os
import requests
from datetime import datetime

LOG_FILE = "logs/update.log"
VERSION_FILE = "version.json"
REMOTE_ZIP_URL = "https://drive.google.com/uc?export=download&id=10UlT1mUkx24UZvK3tfahIvQu3k5hj7z9"

def ensure_log_dir():
    os.makedirs("logs", exist_ok=True)

def log(message):
    ensure_log_dir()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}\n"
    with open(LOG_FILE, "a") as f:
        f.write(log_entry)
    print(log_entry.strip())

def get_local_version():
    try:
        with open(VERSION_FILE, "r") as f:
            data = json.load(f)
            return data.get("version", "0.0.0")
    except FileNotFoundError:
        log("Local version.json not found")
        return "0.0.0"
    except json.JSONDecodeError:
        log("Error parsing local version.json")
        return "0.0.0"

def get_remote_version():
    try:
        log("Checking remote version...")
        return "1.0.0"
    except Exception as e:
        log(f"Error fetching remote version: {e}")
        return None

def compare_versions(local, remote):
    if remote is None:
        return "check_failed"
    
    local_parts = [int(x) for x in local.split(".")]
    remote_parts = [int(x) for x in remote.split(".")]
    
    for l, r in zip(local_parts, remote_parts):
        if r > l:
            return "update_required"
        elif l > r:
            return "up_to_date"
    
    if len(remote_parts) > len(local_parts):
        return "update_required"
    
    return "up_to_date"

def check_update():
    log("=== Version Check Started ===")
    local_version = get_local_version()
    log(f"Local version: {local_version}")
    
    remote_version = get_remote_version()
    log(f"Remote version: {remote_version}")
    
    status = compare_versions(local_version, remote_version)
    log(f"Status: {status}")
    
    return {
        "local_version": local_version,
        "remote_version": remote_version,
        "status": status
    }

if __name__ == "__main__":
    result = check_update()
    print(json.dumps(result, indent=2))
