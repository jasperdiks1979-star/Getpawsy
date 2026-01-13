#!/usr/bin/env python3
"""
Heal Engine - Checks and restores critical files
"""
import os
import json
from datetime import datetime

LOG_FILE = "logs/heal.log"

CRITICAL_FILES = [
    "version.json",
    "server.js",
    "package.json",
    "public/css/style.css",
    "views/index.ejs"
]

CRITICAL_DIRS = [
    "engines",
    "tools",
    "dashboard",
    "config",
    "public",
    "views",
    "routes",
    "logs"
]

def ensure_log_dir():
    os.makedirs("logs", exist_ok=True)

def log(message):
    ensure_log_dir()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}\n"
    with open(LOG_FILE, "a") as f:
        f.write(log_entry)
    print(log_entry.strip())

def check_file(filepath):
    exists = os.path.exists(filepath)
    if exists:
        size = os.path.getsize(filepath)
        return {"exists": True, "size": size, "status": "OK"}
    return {"exists": False, "size": 0, "status": "MISSING"}

def check_directory(dirpath):
    exists = os.path.isdir(dirpath)
    if exists:
        try:
            count = len(os.listdir(dirpath))
            return {"exists": True, "files": count, "status": "OK"}
        except:
            return {"exists": True, "files": 0, "status": "EMPTY"}
    return {"exists": False, "files": 0, "status": "MISSING"}

def create_missing_dirs():
    created = 0
    for dir_path in CRITICAL_DIRS:
        if not os.path.exists(dir_path):
            os.makedirs(dir_path, exist_ok=True)
            log(f"Created missing directory: {dir_path}")
            created += 1
    return created

def restore_version_json():
    if not os.path.exists("version.json"):
        default_version = {
            "version": "1.0.0",
            "name": "GetPawsy Super Dashboard",
            "description": "Full AI-powered dashboard system",
            "build": datetime.now().strftime("%Y-%m-%d")
        }
        with open("version.json", "w") as f:
            json.dump(default_version, f, indent=2)
        log("Restored version.json with defaults")
        return True
    return False

def run_health_check():
    log("=== Heal Engine Started ===")
    
    health_report = {
        "timestamp": datetime.now().isoformat(),
        "files": {},
        "directories": {},
        "issues_found": 0,
        "issues_fixed": 0
    }
    
    log("Checking critical files...")
    for filepath in CRITICAL_FILES:
        status = check_file(filepath)
        health_report["files"][filepath] = status
        if status["status"] != "OK":
            health_report["issues_found"] += 1
            log(f"  MISSING: {filepath}")
        else:
            log(f"  OK: {filepath}")
    
    log("Checking critical directories...")
    for dirpath in CRITICAL_DIRS:
        status = check_directory(dirpath)
        health_report["directories"][dirpath] = status
        if status["status"] != "OK":
            health_report["issues_found"] += 1
            log(f"  MISSING: {dirpath}")
        else:
            log(f"  OK: {dirpath} ({status['files']} files)")
    
    log("Attempting to heal issues...")
    
    dirs_created = create_missing_dirs()
    health_report["issues_fixed"] += dirs_created
    
    if restore_version_json():
        health_report["issues_fixed"] += 1
    
    overall_status = "HEALTHY" if health_report["issues_found"] == 0 else "NEEDS_ATTENTION"
    health_report["overall_status"] = overall_status
    
    log(f"=== Heal Engine Complete ===")
    log(f"Issues found: {health_report['issues_found']}")
    log(f"Issues fixed: {health_report['issues_fixed']}")
    log(f"Overall status: {overall_status}")
    
    report_file = "logs/health_report.json"
    with open(report_file, "w") as f:
        json.dump(health_report, f, indent=2)
    log(f"Health report saved to {report_file}")
    
    return health_report

if __name__ == "__main__":
    report = run_health_check()
    print(json.dumps(report, indent=2))
