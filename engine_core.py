#!/usr/bin/env python3
"""
===========================================================
 GetPawsy ULTRA V2 — CORE ENGINE
 Auto-loader, health check, and router dispatcher
===========================================================
"""

import os
import sys
from pathlib import Path
from datetime import datetime

print("🐾 Core Engine Loading...")

# ===========================================================
#  MODULE IMPORTS
# ===========================================================

MODULES = {
    "engine_import": None,
    "engine_categories": None,
    "engine_homepage": None,
    "engine_search": None,
    "engine_storefront": None,
    "engine_scheduler": None,
    "admin_panel": None,
    "frontend": None
}


def load_module(name):
    """Dynamically load a module"""
    try:
        module = __import__(name)
        MODULES[name] = module
        return True
    except ImportError as e:
        print(f"⚠️ Failed to load {name}: {e}")
        return False


def load_all_modules():
    """Load all engine modules"""
    loaded = 0
    failed = 0
    
    for name in MODULES.keys():
        if load_module(name):
            loaded += 1
        else:
            failed += 1
    
    print(f"📦 Modules: {loaded} loaded, {failed} failed")
    return loaded, failed


# ===========================================================
#  HEALTH CHECK
# ===========================================================

def check_modules():
    """
    Health check for all modules
    Returns dict with status of each module
    """
    status = {
        "timestamp": datetime.now().isoformat(),
        "modules": {},
        "data_files": {},
        "overall": "healthy"
    }
    
    # Check modules
    for name in MODULES.keys():
        try:
            if MODULES[name] is None:
                load_module(name)
            
            if MODULES[name] is not None:
                status["modules"][name] = {
                    "status": "loaded",
                    "healthy": True
                }
            else:
                status["modules"][name] = {
                    "status": "failed",
                    "healthy": False
                }
                status["overall"] = "degraded"
        except Exception as e:
            status["modules"][name] = {
                "status": "error",
                "error": str(e),
                "healthy": False
            }
            status["overall"] = "degraded"
    
    # Check data files
    data_files = [
        "data/products.json",
        "data/homepage.json",
        "data/category_index.json",
        "data/search_index.json",
        "data/storefront.json"
    ]
    
    for filepath in data_files:
        if os.path.exists(filepath):
            size = os.path.getsize(filepath)
            status["data_files"][filepath] = {
                "exists": True,
                "size": size,
                "size_human": f"{size / 1024:.1f} KB"
            }
        else:
            status["data_files"][filepath] = {
                "exists": False
            }
    
    return status


# ===========================================================
#  ENGINE INITIALIZER
# ===========================================================

def initialize_engine():
    """
    Initialize the complete engine
    - Load all modules
    - Create data directories
    - Build initial indexes
    """
    print("\n" + "=" * 60)
    print("  🚀 GetPawsy ULTRA V2 Engine Initializing")
    print("=" * 60 + "\n")
    
    # Create directories
    directories = ["data", "public/products"]
    for d in directories:
        Path(d).mkdir(parents=True, exist_ok=True)
    
    # Load all modules
    loaded, failed = load_all_modules()
    
    if failed > 0:
        print(f"\n⚠️ Warning: {failed} modules failed to load")
    
    # Run initial tasks if data exists
    if os.path.exists("data/products.json"):
        print("\n📊 Building indexes...")
        
        try:
            # Update categories
            if MODULES.get("engine_categories"):
                MODULES["engine_categories"].update_categories()
                MODULES["engine_categories"].get_category_index()
        except Exception as e:
            print(f"   Categories: {e}")
        
        try:
            # Build search index
            if MODULES.get("engine_search"):
                MODULES["engine_search"].build_search_index()
        except Exception as e:
            print(f"   Search: {e}")
        
        try:
            # Build homepage
            if MODULES.get("engine_homepage"):
                MODULES["engine_homepage"].build_homepage_json()
        except Exception as e:
            print(f"   Homepage: {e}")
    
    print("\n✅ Engine initialized successfully")
    
    return check_modules()


# ===========================================================
#  ROUTER DISPATCHER
# ===========================================================

def handle_request(url, params=None):
    """
    Router dispatcher
    Routes URL to appropriate handler and returns page data
    """
    # Ensure storefront module is loaded
    if MODULES.get("engine_storefront") is None:
        load_module("engine_storefront")
    
    storefront = MODULES.get("engine_storefront")
    
    if storefront and hasattr(storefront, "route_request"):
        return storefront.route_request(url, params)
    
    return {
        "type": "error",
        "status": 500,
        "message": "Storefront module not available"
    }


# ===========================================================
#  API FUNCTIONS (for external access)
# ===========================================================

def get_products(limit=50, category=None, animal=None):
    """Get products with optional filtering"""
    if os.path.exists("data/products.json"):
        with open("data/products.json") as f:
            products = json.load(f)
        
        if category:
            products = [p for p in products 
                       if category in (p.get("category_slug") or "")]
        
        if animal:
            products = [p for p in products 
                       if (p.get("animal") or "") == animal]
        
        return products[:limit]
    
    return []


def search(query, limit=20):
    """Search products"""
    if MODULES.get("engine_search") is None:
        load_module("engine_search")
    
    search_mod = MODULES.get("engine_search")
    
    if search_mod and hasattr(search_mod, "search_products"):
        results = search_mod.search_products(query, limit=limit)
        return results.get("results", [])
    
    return []


def get_homepage():
    """Get homepage data"""
    if os.path.exists("data/homepage.json"):
        with open("data/homepage.json") as f:
            return json.load(f)
    return None


def run_import():
    """Run product import"""
    if MODULES.get("engine_import") is None:
        load_module("engine_import")
    
    import_mod = MODULES.get("engine_import")
    
    if import_mod and hasattr(import_mod, "run_import"):
        return import_mod.run_import()
    
    return False


# ===========================================================
#  MAIN ENTRY POINT
# ===========================================================

# Need json for API functions
import json

if __name__ == "__main__":
    print("\n🐾 GetPawsy ULTRA V2 Core Engine\n")
    
    # Initialize engine
    status = initialize_engine()
    
    # Print health check
    print("\n📊 Health Check:")
    print(f"   Overall: {status['overall']}")
    
    print("\n   Modules:")
    for name, info in status["modules"].items():
        icon = "✅" if info.get("healthy") else "❌"
        print(f"      {icon} {name}: {info['status']}")
    
    print("\n   Data Files:")
    for filepath, info in status["data_files"].items():
        if info.get("exists"):
            print(f"      ✅ {filepath}: {info['size_human']}")
        else:
            print(f"      ⚪ {filepath}: not created")
    
    print("\n✅ engine_core.py ready.")
