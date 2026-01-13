#!/usr/bin/env python3
"""
Debug Status - Shows status of all engines and system health
"""
import os
import json
from datetime import datetime

def print_header(title):
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)

def check_file(filepath):
    if os.path.exists(filepath):
        size = os.path.getsize(filepath)
        return f"OK ({size} bytes)"
    return "MISSING"

def check_engine(engine_name):
    engine_path = f"engines/{engine_name}.py"
    return check_file(engine_path)

def check_tool(tool_name):
    tool_path = f"tools/{tool_name}.py"
    return check_file(tool_path)

def check_log(log_name):
    log_path = f"logs/{log_name}.log"
    if os.path.exists(log_path):
        size = os.path.getsize(log_path)
        with open(log_path, "r") as f:
            lines = f.readlines()
        return f"OK ({len(lines)} lines, {size} bytes)"
    return "NOT CREATED"

def get_version():
    try:
        with open("version.json", "r") as f:
            data = json.load(f)
        return data.get("version", "Unknown")
    except:
        return "Unknown"

def main():
    print_header("GETPAWSY DEBUG STATUS")
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Version: {get_version()}")
    
    print_header("ENGINES STATUS")
    engines = [
        "version_engine",
        "update_engine",
        "patch_engine",
        "image_optimizer",
        "breakpoint_engine",
        "heal_engine",
        "publish_engine"
    ]
    for engine in engines:
        status = check_engine(engine)
        print(f"  {engine}: {status}")
    
    print_header("TOOLS STATUS")
    tools = [
        "run_all",
        "download_zip",
        "autorun",
        "debug_status"
    ]
    for tool in tools:
        status = check_tool(tool)
        print(f"  {tool}: {status}")
    
    print_header("LOGS STATUS")
    logs = [
        "update",
        "patcher",
        "optimize",
        "breakpoints",
        "heal",
        "publish",
        "autorun",
        "run_all"
    ]
    for log_name in logs:
        status = check_log(log_name)
        print(f"  {log_name}: {status}")
    
    print_header("CRITICAL FILES")
    critical_files = [
        "version.json",
        "server.js",
        "package.json",
        "public/css/style.css",
        "views/index.ejs",
        "config/breakpoints.json"
    ]
    for filepath in critical_files:
        status = check_file(filepath)
        print(f"  {filepath}: {status}")
    
    print_header("DIRECTORIES")
    directories = [
        "engines",
        "tools",
        "dashboard",
        "config",
        "logs",
        "public",
        "views",
        "routes"
    ]
    for dirpath in directories:
        if os.path.isdir(dirpath):
            count = len([f for f in os.listdir(dirpath) if os.path.isfile(os.path.join(dirpath, f))])
            print(f"  {dirpath}/: OK ({count} files)")
        else:
            print(f"  {dirpath}/: MISSING")
    
    print_header("SUMMARY")
    
    all_engines_ok = all(os.path.exists(f"engines/{e}.py") for e in engines)
    all_tools_ok = all(os.path.exists(f"tools/{t}.py") for t in tools)
    
    if all_engines_ok and all_tools_ok:
        print("  Overall Status: HEALTHY ✓")
    else:
        print("  Overall Status: NEEDS ATTENTION")
        if not all_engines_ok:
            print("  - Some engines are missing")
        if not all_tools_ok:
            print("  - Some tools are missing")
    
    print("\n")

if __name__ == "__main__":
    main()
