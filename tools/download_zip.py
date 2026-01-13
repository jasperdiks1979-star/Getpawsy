#!/usr/bin/env python3
"""
Download ZIP - Manually download the GetPawsy ZIP
"""
import os
import requests
from datetime import datetime

LOG_FILE = "logs/download.log"
ZIP_URL = "https://drive.google.com/uc?export=download&id=10UlT1mUkx24UZvK3tfahIvQu3k5hj7z9"
ZIP_NAME = "getpawsy_super_dashboard.zip"

def ensure_log_dir():
    os.makedirs("logs", exist_ok=True)

def log(message):
    ensure_log_dir()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}\n"
    with open(LOG_FILE, "a") as f:
        f.write(log_entry)
    print(log_entry.strip())

def download_zip():
    log("=== ZIP Download Started ===")
    log(f"URL: {ZIP_URL}")
    
    try:
        log("Sending download request...")
        response = requests.get(ZIP_URL, stream=True, timeout=120)
        response.raise_for_status()
        
        total_size = int(response.headers.get('content-length', 0))
        log(f"File size: {total_size} bytes")
        
        with open(ZIP_NAME, "wb") as f:
            downloaded = 0
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
                downloaded += len(chunk)
                if total_size > 0:
                    percent = (downloaded / total_size) * 100
                    if downloaded % (1024 * 100) == 0:
                        log(f"Progress: {percent:.1f}%")
        
        file_size = os.path.getsize(ZIP_NAME)
        log(f"Download complete: {ZIP_NAME} ({file_size} bytes)")
        
        return {
            "status": "SUCCESS",
            "filename": ZIP_NAME,
            "size": file_size
        }
        
    except requests.exceptions.RequestException as e:
        log(f"Download failed: {e}")
        return {
            "status": "FAILED",
            "error": str(e)
        }
    except Exception as e:
        log(f"Unexpected error: {e}")
        return {
            "status": "FAILED",
            "error": str(e)
        }

if __name__ == "__main__":
    result = download_zip()
    print(f"\nResult: {result}")
