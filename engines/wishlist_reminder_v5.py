#!/usr/bin/env python3
"""
GetPawsy Wishlist Reminder Engine V5.4
Notify customers when wishlist items go on sale or back in stock
"""

import os
import json
import requests
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
WISHLIST_FILE = DATA_DIR / "wishlists.json"
PRODUCTS_FILE = DATA_DIR / "products_v5.json"
PRICE_HISTORY_FILE = DATA_DIR / "price_history.json"
REMINDER_LOG_FILE = DATA_DIR / "wishlist_reminders.json"

def load_wishlists() -> Dict:
    """Load all wishlists"""
    if WISHLIST_FILE.exists():
        with open(WISHLIST_FILE, "r") as f:
            return json.load(f)
    return {"wishlists": {}, "settings": {"enabled": True}}

def save_wishlists(data: Dict):
    """Save wishlists"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(WISHLIST_FILE, "w") as f:
        json.dump(data, f, indent=2)

def load_products() -> List[Dict]:
    """Load products"""
    if PRODUCTS_FILE.exists():
        with open(PRODUCTS_FILE, "r") as f:
            data = json.load(f)
            return data.get("products", [])
    return []

def load_price_history() -> Dict:
    """Load price history"""
    if PRICE_HISTORY_FILE.exists():
        with open(PRICE_HISTORY_FILE, "r") as f:
            return json.load(f)
    return {}

def save_price_history(data: Dict):
    """Save price history"""
    with open(PRICE_HISTORY_FILE, "w") as f:
        json.dump(data, f, indent=2)

def load_reminder_log() -> List[Dict]:
    """Load reminder log"""
    if REMINDER_LOG_FILE.exists():
        with open(REMINDER_LOG_FILE, "r") as f:
            return json.load(f)
    return []

def save_reminder_log(log: List[Dict]):
    """Save reminder log"""
    with open(REMINDER_LOG_FILE, "w") as f:
        json.dump(log, f, indent=2)

def add_to_wishlist(user_id: str, email: str, product_id: str, product_name: str, 
                    current_price: float, notify_on_sale: bool = True, 
                    notify_back_in_stock: bool = True) -> Dict:
    """Add item to wishlist with notification preferences"""
    data = load_wishlists()
    
    if user_id not in data["wishlists"]:
        data["wishlists"][user_id] = {
            "email": email,
            "items": [],
            "created_at": datetime.now().isoformat()
        }
    
    # Check if already in wishlist
    existing = next(
        (i for i in data["wishlists"][user_id]["items"] if i["product_id"] == product_id), 
        None
    )
    
    if existing:
        existing["notify_on_sale"] = notify_on_sale
        existing["notify_back_in_stock"] = notify_back_in_stock
        save_wishlists(data)
        return {"success": True, "updated": True}
    
    item = {
        "product_id": product_id,
        "product_name": product_name,
        "added_price": current_price,
        "added_at": datetime.now().isoformat(),
        "notify_on_sale": notify_on_sale,
        "notify_back_in_stock": notify_back_in_stock
    }
    
    data["wishlists"][user_id]["items"].append(item)
    save_wishlists(data)
    
    # Track price
    track_price(product_id, current_price)
    
    return {"success": True, "item": item}

def remove_from_wishlist(user_id: str, product_id: str) -> Dict:
    """Remove item from wishlist"""
    data = load_wishlists()
    
    if user_id not in data["wishlists"]:
        return {"success": False, "error": "Wishlist not found"}
    
    items = data["wishlists"][user_id]["items"]
    data["wishlists"][user_id]["items"] = [i for i in items if i["product_id"] != product_id]
    save_wishlists(data)
    
    return {"success": True}

def get_wishlist(user_id: str) -> List[Dict]:
    """Get user's wishlist with current prices"""
    data = load_wishlists()
    products = load_products()
    
    if user_id not in data["wishlists"]:
        return []
    
    items = data["wishlists"][user_id]["items"]
    enriched = []
    
    for item in items:
        product = next((p for p in products if str(p.get("id")) == str(item["product_id"])), None)
        
        enriched_item = {**item}
        if product:
            enriched_item["current_price"] = product.get("price", item["added_price"])
            enriched_item["in_stock"] = product.get("stock", 0) > 0
            enriched_item["image"] = product.get("image", "")
            
            # Calculate discount
            added = item.get("added_price", 0)
            current = product.get("price", added)
            if current < added:
                enriched_item["discount_percent"] = round((added - current) / added * 100)
                enriched_item["on_sale"] = True
            else:
                enriched_item["on_sale"] = False
        
        enriched.append(enriched_item)
    
    return enriched

def track_price(product_id: str, price: float):
    """Track product price for history"""
    history = load_price_history()
    
    if product_id not in history:
        history[product_id] = []
    
    history[product_id].append({
        "price": price,
        "timestamp": datetime.now().isoformat()
    })
    
    # Keep last 30 entries
    history[product_id] = history[product_id][-30:]
    
    save_price_history(history)

def check_price_drops() -> List[Dict]:
    """Check for price drops on wishlist items"""
    data = load_wishlists()
    products = load_products()
    price_drops = []
    
    for user_id, wishlist in data["wishlists"].items():
        for item in wishlist.get("items", []):
            if not item.get("notify_on_sale"):
                continue
            
            product = next(
                (p for p in products if str(p.get("id")) == str(item["product_id"])), 
                None
            )
            
            if not product:
                continue
            
            current_price = product.get("price", 0)
            added_price = item.get("added_price", current_price)
            
            # Check for significant drop (at least 10%)
            if current_price < added_price * 0.9:
                price_drops.append({
                    "user_id": user_id,
                    "email": wishlist.get("email"),
                    "product_id": item["product_id"],
                    "product_name": item.get("product_name"),
                    "original_price": added_price,
                    "current_price": current_price,
                    "discount_percent": round((added_price - current_price) / added_price * 100),
                    "product_image": product.get("image", "")
                })
    
    return price_drops

def check_back_in_stock() -> List[Dict]:
    """Check for back in stock items"""
    data = load_wishlists()
    products = load_products()
    back_in_stock = []
    
    # Load previous stock status
    stock_status_file = DATA_DIR / "stock_status.json"
    if stock_status_file.exists():
        with open(stock_status_file, "r") as f:
            prev_status = json.load(f)
    else:
        prev_status = {}
    
    current_status = {}
    
    for product in products:
        pid = str(product.get("id"))
        in_stock = product.get("stock", 0) > 0
        current_status[pid] = in_stock
        
        # Check if just came back in stock
        if in_stock and not prev_status.get(pid, True):
            # Find users who have this on wishlist
            for user_id, wishlist in data["wishlists"].items():
                for item in wishlist.get("items", []):
                    if str(item["product_id"]) == pid and item.get("notify_back_in_stock"):
                        back_in_stock.append({
                            "user_id": user_id,
                            "email": wishlist.get("email"),
                            "product_id": pid,
                            "product_name": product.get("name"),
                            "price": product.get("price"),
                            "product_image": product.get("image", "")
                        })
    
    # Save current status
    with open(stock_status_file, "w") as f:
        json.dump(current_status, f)
    
    return back_in_stock

def generate_price_drop_email(drop: Dict) -> str:
    """Generate price drop notification email"""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
    </head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; padding: 20px; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden;">
            
            <div style="background: linear-gradient(135deg, #ff6b35, #f7931e); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0;">🔥 Price Drop Alert!</h1>
            </div>
            
            <div style="padding: 30px;">
                <p style="color: #666;">Great news! An item on your wishlist just went on sale!</p>
                
                <div style="background: #f9f9f9; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center;">
                    <img src="{drop.get('product_image', '')}" width="150" style="border-radius: 8px;">
                    <h3 style="color: #333; margin: 15px 0 10px;">{drop.get('product_name', 'Product')}</h3>
                    
                    <div style="margin: 15px 0;">
                        <span style="text-decoration: line-through; color: #999; font-size: 18px;">
                            ${drop.get('original_price', 0):.2f}
                        </span>
                        <span style="color: #ff6b35; font-size: 28px; font-weight: bold; margin-left: 10px;">
                            ${drop.get('current_price', 0):.2f}
                        </span>
                    </div>
                    
                    <div style="background: #ff6b35; color: white; padding: 8px 16px; border-radius: 20px; display: inline-block; font-weight: bold;">
                        SAVE {drop.get('discount_percent', 0)}%
                    </div>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://getpawsy.pet/product/{drop.get('product_id')}" 
                       style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 15px 40px; border-radius: 30px; text-decoration: none; font-weight: bold; font-size: 16px;">
                        Buy Now Before It's Gone →
                    </a>
                </div>
            </div>
            
            <div style="background: #f9f9f9; padding: 20px; text-align: center;">
                <p style="color: #999; font-size: 12px;">© 2025 GetPawsy | You're receiving this because this item is on your wishlist</p>
            </div>
        </div>
    </body>
    </html>
    """

def generate_back_in_stock_email(item: Dict) -> str:
    """Generate back in stock notification email"""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
    </head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; padding: 20px; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden;">
            
            <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0;">🎉 Back In Stock!</h1>
            </div>
            
            <div style="padding: 30px;">
                <p style="color: #666;">The item you've been waiting for is back in stock!</p>
                
                <div style="background: #f9f9f9; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center;">
                    <img src="{item.get('product_image', '')}" width="150" style="border-radius: 8px;">
                    <h3 style="color: #333; margin: 15px 0 10px;">{item.get('product_name', 'Product')}</h3>
                    <p style="color: #ff6b35; font-size: 24px; font-weight: bold;">${item.get('price', 0):.2f}</p>
                    
                    <div style="background: #10b981; color: white; padding: 8px 16px; border-radius: 20px; display: inline-block; font-weight: bold;">
                        ✓ IN STOCK
                    </div>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://getpawsy.pet/product/{item.get('product_id')}" 
                       style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 15px 40px; border-radius: 30px; text-decoration: none; font-weight: bold; font-size: 16px;">
                        Get It Now →
                    </a>
                </div>
                
                <p style="color: #999; font-size: 14px; text-align: center;">
                    ⚡ Popular items sell out fast - don't miss out!
                </p>
            </div>
            
            <div style="background: #f9f9f9; padding: 20px; text-align: center;">
                <p style="color: #999; font-size: 12px;">© 2025 GetPawsy | You're receiving this because this item is on your wishlist</p>
            </div>
        </div>
    </body>
    </html>
    """

def send_wishlist_reminders() -> Dict:
    """Process and send all wishlist reminders"""
    results = {"price_drops": [], "back_in_stock": []}
    log = load_reminder_log()
    
    # Check price drops
    price_drops = check_price_drops()
    for drop in price_drops:
        # Check if already notified recently
        recent = [
            l for l in log 
            if l.get("product_id") == drop["product_id"] 
            and l.get("user_id") == drop["user_id"]
            and l.get("type") == "price_drop"
            and datetime.fromisoformat(l.get("sent_at", "2020-01-01")) > datetime.now() - timedelta(days=7)
        ]
        
        if recent:
            continue
        
        try:
            html = generate_price_drop_email(drop)
            requests.post(
                "http://localhost:5000/api/email/send",
                json={
                    "to": drop["email"],
                    "subject": f"🔥 Price Drop: {drop['product_name']} is now {drop['discount_percent']}% off!",
                    "html": html
                },
                timeout=5
            )
            
            log.append({
                "type": "price_drop",
                "user_id": drop["user_id"],
                "product_id": drop["product_id"],
                "sent_at": datetime.now().isoformat()
            })
            
            results["price_drops"].append(drop)
        except Exception as e:
            print(f"Failed to send price drop email: {e}")
    
    # Check back in stock
    back_in_stock = check_back_in_stock()
    for item in back_in_stock:
        # Check if already notified
        recent = [
            l for l in log 
            if l.get("product_id") == item["product_id"] 
            and l.get("user_id") == item["user_id"]
            and l.get("type") == "back_in_stock"
            and datetime.fromisoformat(l.get("sent_at", "2020-01-01")) > datetime.now() - timedelta(days=1)
        ]
        
        if recent:
            continue
        
        try:
            html = generate_back_in_stock_email(item)
            requests.post(
                "http://localhost:5000/api/email/send",
                json={
                    "to": item["email"],
                    "subject": f"🎉 {item['product_name']} is back in stock!",
                    "html": html
                },
                timeout=5
            )
            
            log.append({
                "type": "back_in_stock",
                "user_id": item["user_id"],
                "product_id": item["product_id"],
                "sent_at": datetime.now().isoformat()
            })
            
            results["back_in_stock"].append(item)
        except Exception as e:
            print(f"Failed to send back in stock email: {e}")
    
    save_reminder_log(log)
    return results

def get_stats() -> Dict:
    """Get wishlist reminder statistics"""
    data = load_wishlists()
    log = load_reminder_log()
    
    total_wishlists = len(data.get("wishlists", {}))
    total_items = sum(len(w.get("items", [])) for w in data.get("wishlists", {}).values())
    
    price_drop_sent = len([l for l in log if l.get("type") == "price_drop"])
    back_in_stock_sent = len([l for l in log if l.get("type") == "back_in_stock"])
    
    return {
        "total_wishlists": total_wishlists,
        "total_wishlist_items": total_items,
        "price_drop_emails_sent": price_drop_sent,
        "back_in_stock_emails_sent": back_in_stock_sent
    }

if __name__ == "__main__":
    print("=== Wishlist Reminder Engine V5.4 ===")
    print("\nStats:")
    print(json.dumps(get_stats(), indent=2))
    
    print("\nChecking for reminders to send...")
    results = send_wishlist_reminders()
    print(f"Price drops: {len(results['price_drops'])}")
    print(f"Back in stock: {len(results['back_in_stock'])}")
