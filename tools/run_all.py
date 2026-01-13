#!/usr/bin/env python3
"""
Run All - Executes all engines in logical order
"""
import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

LOG_FILE = "logs/run_all.log"

def ensure_log_dir():
    os.makedirs("logs", exist_ok=True)

def log(message):
    ensure_log_dir()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}\n"
    with open(LOG_FILE, "a") as f:
        f.write(log_entry)
    print(log_entry.strip())

def run_engine(engine_name, engine_func):
    try:
        log(f"Running {engine_name}...")
        result = engine_func()
        log(f"{engine_name} completed: {result}")
        return {"status": "SUCCESS", "result": result}
    except Exception as e:
        log(f"{engine_name} failed: {e}")
        return {"status": "FAILED", "error": str(e)}

def main():
    log("=" * 50)
    log("=== RUN ALL ENGINES STARTED ===")
    log("=" * 50)
    
    results = {}
    
    try:
        from engines.version_engine import check_update
        results["version"] = run_engine("Version Engine", check_update)
        
        if results["version"]["status"] == "SUCCESS":
            version_result = results["version"]["result"]
            if version_result.get("status") == "update_required":
                log("Update required, running update engine...")
                from engines.update_engine import run_update
                results["update"] = run_engine("Update Engine", run_update)
    except ImportError as e:
        log(f"Could not import version engine: {e}")
        results["version"] = {"status": "SKIPPED", "reason": str(e)}
    
    try:
        from engines.heal_engine import run_health_check
        results["heal"] = run_engine("Heal Engine", run_health_check)
    except ImportError as e:
        log(f"Could not import heal engine: {e}")
        results["heal"] = {"status": "SKIPPED", "reason": str(e)}
    
    try:
        from engines.image_optimizer import run_optimization
        results["optimize"] = run_engine("Image Optimizer", run_optimization)
    except ImportError as e:
        log(f"Could not import image optimizer: {e}")
        results["optimize"] = {"status": "SKIPPED", "reason": str(e)}
    
    try:
        from engines.breakpoint_engine import run_breakpoint_engine
        results["breakpoints"] = run_engine("Breakpoint Engine", run_breakpoint_engine)
    except ImportError as e:
        log(f"Could not import breakpoint engine: {e}")
        results["breakpoints"] = {"status": "SKIPPED", "reason": str(e)}
    
    try:
        from engines.patch_engine import run_patches
        results["patch"] = run_engine("Patch Engine", run_patches)
    except ImportError as e:
        log(f"Could not import patch engine: {e}")
        results["patch"] = {"status": "SKIPPED", "reason": str(e)}
    
    try:
        from engines.publish_engine import run_publish
        results["publish"] = run_engine("Publish Engine", run_publish)
    except ImportError as e:
        log(f"Could not import publish engine: {e}")
        results["publish"] = {"status": "SKIPPED", "reason": str(e)}
    
    log("=" * 50)
    log("=== RUN ALL ENGINES COMPLETE ===")
    log("=" * 50)
    
    success_count = sum(1 for r in results.values() if r["status"] == "SUCCESS")
    failed_count = sum(1 for r in results.values() if r["status"] == "FAILED")
    skipped_count = sum(1 for r in results.values() if r["status"] == "SKIPPED")
    
    log(f"Results: {success_count} SUCCESS, {failed_count} FAILED, {skipped_count} SKIPPED")
    
    return results

if __name__ == "__main__":
    results = main()
    print("\n=== FINAL RESULTS ===")
    for engine, result in results.items():
        print(f"{engine}: {result['status']}")
