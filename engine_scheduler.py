#!/usr/bin/env python3
"""
===========================================================
 GetPawsy ULTRA V2 — SCHEDULER ENGINE
 Hourly/daily task scheduling with overlap protection
===========================================================
"""

import os
import json
import time
import threading
from pathlib import Path
from datetime import datetime, timedelta

print("⏰ Scheduler Engine Loaded")

# Lock file for overlap protection
LOCK_FILE = "data/.scheduler_lock"
LOG_FILE = "data/scheduler.log"


def log_message(message):
    """Log scheduler message with timestamp"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_line = f"[{timestamp}] {message}"
    
    print(log_line)
    
    # Append to log file
    Path("data").mkdir(exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(log_line + "\n")


def acquire_lock():
    """Acquire scheduler lock (overlap protection)"""
    if os.path.exists(LOCK_FILE):
        # Check if lock is stale (older than 1 hour)
        try:
            with open(LOCK_FILE) as f:
                lock_time = datetime.fromisoformat(f.read().strip())
            
            if datetime.now() - lock_time < timedelta(hours=1):
                log_message("⚠️ Scheduler already running (locked)")
                return False
        except:
            pass
    
    # Create lock
    with open(LOCK_FILE, "w") as f:
        f.write(datetime.now().isoformat())
    
    return True


def release_lock():
    """Release scheduler lock"""
    if os.path.exists(LOCK_FILE):
        os.remove(LOCK_FILE)


def task_refresh_seo():
    """Refresh SEO data for products"""
    log_message("🔄 Running SEO refresh...")
    
    try:
        # Load products
        if not os.path.exists("data/products.json"):
            log_message("   No products found")
            return
        
        with open("data/products.json") as f:
            products = json.load(f)
        
        # Update products without SEO data
        updated = 0
        for product in products:
            if not product.get("seo_title"):
                title = product.get("title", "Pet Product")
                product["seo_title"] = f"{title} | GetPawsy"
                updated += 1
            
            if not product.get("seo_description"):
                title = product.get("title", "Pet Product")
                product["seo_description"] = f"Shop {title} at GetPawsy. Fast US shipping."
                updated += 1
        
        if updated > 0:
            with open("data/products.json", "w") as f:
                json.dump(products, f, indent=2)
        
        log_message(f"   SEO refresh complete: {updated} fields updated")
        
    except Exception as e:
        log_message(f"   ❌ SEO refresh error: {e}")


def task_refresh_homepage():
    """Refresh homepage data"""
    log_message("🔄 Running homepage refresh...")
    
    try:
        from engine_homepage import build_homepage_json
        build_homepage_json()
        log_message("   Homepage refresh complete")
        
    except Exception as e:
        log_message(f"   ❌ Homepage refresh error: {e}")


def task_update_categories():
    """Update product categories"""
    log_message("🔄 Running category update...")
    
    try:
        from engine_categories import update_categories, get_category_index
        update_categories()
        get_category_index()
        log_message("   Category update complete")
        
    except Exception as e:
        log_message(f"   ❌ Category update error: {e}")


def task_rebuild_search_index():
    """Rebuild search index"""
    log_message("🔄 Rebuilding search index...")
    
    try:
        from engine_search import build_search_index
        build_search_index()
        log_message("   Search index rebuilt")
        
    except Exception as e:
        log_message(f"   ❌ Search index error: {e}")


def task_cleanup_logs():
    """Clean up old log entries"""
    log_message("🧹 Cleaning up logs...")
    
    try:
        if os.path.exists(LOG_FILE):
            with open(LOG_FILE) as f:
                lines = f.readlines()
            
            # Keep last 500 lines
            if len(lines) > 500:
                with open(LOG_FILE, "w") as f:
                    f.writelines(lines[-500:])
                log_message(f"   Cleaned {len(lines) - 500} old log entries")
        
    except Exception as e:
        log_message(f"   ❌ Log cleanup error: {e}")


def run_hourly_tasks():
    """
    Run hourly scheduled tasks
    - Homepage refresh
    - Search index update
    """
    log_message("=" * 50)
    log_message("⏰ HOURLY TASKS STARTING")
    log_message("=" * 50)
    
    if not acquire_lock():
        return False
    
    try:
        task_refresh_homepage()
        task_rebuild_search_index()
        
        log_message("✅ Hourly tasks complete")
        return True
        
    except Exception as e:
        log_message(f"❌ Hourly tasks failed: {e}")
        return False
        
    finally:
        release_lock()


def run_daily_tasks():
    """
    Run daily scheduled tasks
    - SEO refresh
    - Category update
    - Homepage refresh
    - Search index rebuild
    - Log cleanup
    """
    log_message("=" * 50)
    log_message("📅 DAILY TASKS STARTING")
    log_message("=" * 50)
    
    if not acquire_lock():
        return False
    
    try:
        task_refresh_seo()
        task_update_categories()
        task_refresh_homepage()
        task_rebuild_search_index()
        task_cleanup_logs()
        
        log_message("✅ Daily tasks complete")
        return True
        
    except Exception as e:
        log_message(f"❌ Daily tasks failed: {e}")
        return False
        
    finally:
        release_lock()


def run_scheduler_loop(interval_hours=1):
    """
    Run continuous scheduler loop
    """
    log_message("🚀 Scheduler loop starting")
    log_message(f"   Interval: {interval_hours} hour(s)")
    
    last_daily = None
    
    while True:
        try:
            now = datetime.now()
            
            # Check if we should run daily tasks (at midnight or first run)
            if last_daily is None or now.date() > last_daily.date():
                run_daily_tasks()
                last_daily = now
            else:
                run_hourly_tasks()
            
            # Sleep until next interval
            sleep_seconds = interval_hours * 3600
            log_message(f"💤 Sleeping for {interval_hours} hour(s)...")
            time.sleep(sleep_seconds)
            
        except KeyboardInterrupt:
            log_message("⏹️ Scheduler stopped by user")
            break
            
        except Exception as e:
            log_message(f"❌ Scheduler error: {e}")
            time.sleep(60)  # Wait 1 minute before retry


def start_background_scheduler(interval_hours=1):
    """
    Start scheduler in background thread
    """
    thread = threading.Thread(
        target=run_scheduler_loop,
        args=(interval_hours,),
        daemon=True
    )
    thread.start()
    log_message("🔄 Background scheduler started")
    return thread


# Main execution
if __name__ == "__main__":
    print("\n⏰ GetPawsy Scheduler Engine\n")
    
    import sys
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "hourly":
            run_hourly_tasks()
        elif sys.argv[1] == "daily":
            run_daily_tasks()
        elif sys.argv[1] == "loop":
            run_scheduler_loop()
        else:
            print("Usage: python engine_scheduler.py [hourly|daily|loop]")
    else:
        # Run hourly tasks by default
        run_hourly_tasks()
    
    print("\n✅ engine_scheduler.py ready.")
