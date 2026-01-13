#!/usr/bin/env python3
"""
GetPawsy Abandoned Cart Recovery Engine V5.4
Tracks abandoned carts and sends automated recovery emails
"""

import os
import json
import requests
from pathlib import Path
from datetime import datetime, timedelta
from typing import List, Dict, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
CARTS_FILE = DATA_DIR / "abandoned_carts.json"
RECOVERY_LOG_FILE = DATA_DIR / "recovery_emails_log.json"

# Recovery email timing (hours after cart abandonment)
RECOVERY_STAGES = [
    {"hours": 1, "template": "reminder_1", "subject": "🛒 You left something behind!"},
    {"hours": 24, "template": "reminder_2", "subject": "🐾 Your furry friend is waiting..."},
    {"hours": 72, "template": "final_offer", "subject": "⏰ Last chance! 10% off your cart"}
]

def load_abandoned_carts() -> Dict:
    """Load all abandoned carts"""
    if CARTS_FILE.exists():
        with open(CARTS_FILE, "r") as f:
            return json.load(f)
    return {"carts": [], "settings": {"enabled": True, "discount_code": "COMEBACK10"}}

def save_abandoned_carts(data: Dict):
    """Save abandoned carts data"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(CARTS_FILE, "w") as f:
        json.dump(data, f, indent=2)

def load_recovery_log() -> List[Dict]:
    """Load recovery email log"""
    if RECOVERY_LOG_FILE.exists():
        with open(RECOVERY_LOG_FILE, "r") as f:
            return json.load(f)
    return []

def save_recovery_log(log: List[Dict]):
    """Save recovery email log"""
    with open(RECOVERY_LOG_FILE, "w") as f:
        json.dump(log, f, indent=2)

def track_cart(user_id: str, email: str, cart_items: List[Dict], cart_total: float) -> Dict:
    """Track a cart for abandonment recovery"""
    data = load_abandoned_carts()
    
    # Remove existing cart for this user
    data["carts"] = [c for c in data["carts"] if c.get("user_id") != user_id]
    
    # Add new cart entry
    cart_entry = {
        "id": f"cart_{user_id}_{int(datetime.now().timestamp())}",
        "user_id": user_id,
        "email": email,
        "items": cart_items,
        "total": cart_total,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "status": "active",
        "recovery_stage": 0,
        "recovered": False
    }
    
    data["carts"].append(cart_entry)
    save_abandoned_carts(data)
    
    return {"success": True, "cart_id": cart_entry["id"]}

def mark_cart_converted(user_id: str) -> Dict:
    """Mark cart as converted (order placed)"""
    data = load_abandoned_carts()
    
    for cart in data["carts"]:
        if cart.get("user_id") == user_id and cart.get("status") == "active":
            cart["status"] = "converted"
            cart["converted_at"] = datetime.now().isoformat()
            cart["recovered"] = cart.get("recovery_stage", 0) > 0
    
    save_abandoned_carts(data)
    return {"success": True}

def get_carts_for_recovery() -> List[Dict]:
    """Get carts that need recovery emails"""
    data = load_abandoned_carts()
    if not data.get("settings", {}).get("enabled", True):
        return []
    
    carts_to_recover = []
    now = datetime.now()
    
    for cart in data["carts"]:
        if cart.get("status") != "active":
            continue
        
        created = datetime.fromisoformat(cart["created_at"])
        hours_since = (now - created).total_seconds() / 3600
        current_stage = cart.get("recovery_stage", 0)
        
        # Check if we should send next recovery email
        for i, stage in enumerate(RECOVERY_STAGES):
            if i == current_stage and hours_since >= stage["hours"]:
                carts_to_recover.append({
                    "cart": cart,
                    "stage": stage,
                    "stage_index": i
                })
                break
    
    return carts_to_recover

def generate_recovery_email_html(cart: Dict, stage: Dict, discount_code: str) -> str:
    """Generate recovery email HTML"""
    items_html = ""
    for item in cart.get("items", []):
        items_html += f"""
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">
                <img src="{item.get('image', '')}" width="60" height="60" style="border-radius: 8px;">
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">
                <strong>{item.get('name', 'Product')}</strong><br>
                <span style="color: #666;">Qty: {item.get('quantity', 1)}</span>
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
                ${item.get('price', 0):.2f}
            </td>
        </tr>
        """
    
    discount_section = ""
    if stage.get("template") == "final_offer":
        discount_section = f"""
        <div style="background: linear-gradient(135deg, #ff6b35, #f7c59f); padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0;">
            <h2 style="color: white; margin: 0;">🎁 EXCLUSIVE 10% OFF</h2>
            <p style="color: white; font-size: 14px; margin: 10px 0;">Use code at checkout:</p>
            <div style="background: white; padding: 15px 30px; border-radius: 8px; display: inline-block;">
                <span style="font-size: 24px; font-weight: bold; color: #ff6b35; letter-spacing: 2px;">{discount_code}</span>
            </div>
        </div>
        """
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; padding: 20px; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">🐾 GetPawsy</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Your pet deserves the best!</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 30px;">
                <h2 style="color: #333; margin-top: 0;">{stage.get('subject', 'Complete your order!')}</h2>
                
                <p style="color: #666; line-height: 1.6;">
                    Hey there! We noticed you left some amazing items in your cart. 
                    Your furry friend is counting on you! 🐶🐱
                </p>
                
                <!-- Cart Items -->
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    {items_html}
                    <tr style="background: #f9f9f9;">
                        <td colspan="2" style="padding: 15px; font-weight: bold;">Total:</td>
                        <td style="padding: 15px; text-align: right; font-weight: bold; color: #ff6b35; font-size: 20px;">
                            ${cart.get('total', 0):.2f}
                        </td>
                    </tr>
                </table>
                
                {discount_section}
                
                <!-- CTA Button -->
                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://getpawsy.pet/cart" style="background: linear-gradient(135deg, #ff6b35, #f7931e); color: white; padding: 16px 40px; border-radius: 30px; text-decoration: none; font-weight: bold; font-size: 18px; display: inline-block; box-shadow: 0 4px 15px rgba(255,107,53,0.4);">
                        Complete My Order →
                    </a>
                </div>
                
                <p style="color: #999; font-size: 12px; text-align: center;">
                    Questions? Reply to this email or chat with Pawsy AI on our site!
                </p>
            </div>
            
            <!-- Footer -->
            <div style="background: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                <p style="color: #999; font-size: 12px; margin: 0;">
                    © 2025 GetPawsy | Made with ❤️ for pet lovers
                </p>
            </div>
        </div>
    </body>
    </html>
    """

def send_recovery_email(cart: Dict, stage: Dict) -> Dict:
    """Send recovery email for abandoned cart"""
    data = load_abandoned_carts()
    discount_code = data.get("settings", {}).get("discount_code", "COMEBACK10")
    
    email = cart.get("email")
    if not email:
        return {"success": False, "error": "No email address"}
    
    html = generate_recovery_email_html(cart, stage, discount_code)
    
    try:
        # Use the existing email API
        response = requests.post(
            "http://localhost:5000/api/email/send",
            json={
                "to": email,
                "subject": stage.get("subject", "Complete your order!"),
                "html": html
            },
            timeout=10
        )
        
        # Log the recovery attempt
        log = load_recovery_log()
        log.append({
            "cart_id": cart.get("id"),
            "email": email,
            "stage": stage.get("template"),
            "sent_at": datetime.now().isoformat(),
            "success": response.status_code == 200
        })
        save_recovery_log(log)
        
        # Update cart recovery stage
        for c in data["carts"]:
            if c.get("id") == cart.get("id"):
                c["recovery_stage"] = c.get("recovery_stage", 0) + 1
                c["last_recovery_email"] = datetime.now().isoformat()
        save_abandoned_carts(data)
        
        return {"success": True, "email": email, "stage": stage.get("template")}
        
    except Exception as e:
        return {"success": False, "error": str(e)}

def process_recovery_emails() -> Dict:
    """Process all pending recovery emails"""
    carts = get_carts_for_recovery()
    results = []
    
    for item in carts:
        result = send_recovery_email(item["cart"], item["stage"])
        results.append(result)
    
    return {
        "processed": len(results),
        "successful": sum(1 for r in results if r.get("success")),
        "results": results
    }

def get_recovery_stats() -> Dict:
    """Get abandoned cart recovery statistics"""
    data = load_abandoned_carts()
    carts = data.get("carts", [])
    
    total = len(carts)
    active = sum(1 for c in carts if c.get("status") == "active")
    converted = sum(1 for c in carts if c.get("status") == "converted")
    recovered = sum(1 for c in carts if c.get("recovered"))
    
    # Calculate potential revenue
    potential_revenue = sum(c.get("total", 0) for c in carts if c.get("status") == "active")
    recovered_revenue = sum(c.get("total", 0) for c in carts if c.get("recovered"))
    
    return {
        "total_carts": total,
        "active_carts": active,
        "converted_carts": converted,
        "recovered_carts": recovered,
        "recovery_rate": (recovered / converted * 100) if converted > 0 else 0,
        "potential_revenue": potential_revenue,
        "recovered_revenue": recovered_revenue
    }

def cleanup_old_carts(days: int = 30):
    """Remove carts older than specified days"""
    data = load_abandoned_carts()
    cutoff = datetime.now() - timedelta(days=days)
    
    original_count = len(data.get("carts", []))
    data["carts"] = [
        c for c in data.get("carts", [])
        if datetime.fromisoformat(c["created_at"]) > cutoff
    ]
    removed = original_count - len(data["carts"])
    
    save_abandoned_carts(data)
    return {"removed": removed}

# Flask API routes (to be imported by admin panel)
def get_api_routes():
    """Return API route handlers for Flask"""
    return {
        "track": track_cart,
        "convert": mark_cart_converted,
        "process": process_recovery_emails,
        "stats": get_recovery_stats,
        "cleanup": cleanup_old_carts
    }

if __name__ == "__main__":
    print("=== Abandoned Cart Recovery Engine V5.4 ===")
    print("\nCurrent stats:")
    print(json.dumps(get_recovery_stats(), indent=2))
    
    print("\nProcessing recovery emails...")
    result = process_recovery_emails()
    print(json.dumps(result, indent=2))
