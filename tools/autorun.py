#!/usr/bin/env python3
"""
Autorun - Executed on every Replit start
"""
import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

LOG_FILE = "logs/autorun.log"

def ensure_log_dir():
    os.makedirs("logs", exist_ok=True)

def log(message):
    ensure_log_dir()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}\n"
    with open(LOG_FILE, "a") as f:
        f.write(log_entry)
    print(log_entry.strip())

def check_updates():
    try:
        from engines.version_engine import check_update
        result = check_update()
        log(f"Version check: {result}")
        return result
    except ImportError as e:
        log(f"Could not check updates: {e}")
        return None

def run_heal():
    try:
        from engines.heal_engine import run_health_check
        result = run_health_check()
        log(f"Health check: {result['overall_status']}")
        return result
    except ImportError as e:
        log(f"Could not run health check: {e}")
        return None

def main():
    log("=" * 50)
    log("=== GETPAWSY AUTORUN STARTED ===")
    log("=" * 50)
    
    update_result = check_updates()
    if update_result and update_result.get("status") == "update_required":
        log("Update available! Run 'python3 tools/run_all.py' to update.")
    
    health_result = run_heal()
    if health_result and health_result.get("overall_status") == "NEEDS_ATTENTION":
        log("System needs attention. Check logs/health_report.json for details.")
    
    log("=" * 50)
    log("=== GETPAWSY AUTORUN COMPLETE ===")
    log("=" * 50)
    
    log("Starting main application...")
    os.system("node server.js")

if __name__ == "__main__":
    main()
