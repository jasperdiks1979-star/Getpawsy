#!/usr/bin/env python3
"""
GetPawsy Dynamic Discount Engine V5.4
Coupon codes, flash sales, and bulk discounts
"""

import os
import json
import random
import string
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DISCOUNTS_FILE = DATA_DIR / "discounts.json"
USAGE_LOG_FILE = DATA_DIR / "discount_usage.json"

# Discount types
DISCOUNT_TYPES = {
    "percentage": "Percentage off",
    "fixed": "Fixed amount off",
    "shipping": "Free shipping",
    "bogo": "Buy one get one",
    "bundle": "Bundle discount"
}

def load_discounts() -> Dict:
    """Load all discounts"""
    if DISCOUNTS_FILE.exists():
        with open(DISCOUNTS_FILE, "r") as f:
            return json.load(f)
    
    # Initialize with some default codes
    default_data = {
        "coupons": [
            {
                "code": "WELCOME15",
                "type": "percentage",
                "value": 15,
                "description": "15% off first order",
                "min_order": 0,
                "max_uses": None,
                "uses": 0,
                "first_order_only": True,
                "active": True,
                "expires_at": None,
                "created_at": datetime.now().isoformat()
            },
            {
                "code": "FREESHIP50",
                "type": "shipping",
                "value": 0,
                "description": "Free shipping on orders $50+",
                "min_order": 50,
                "max_uses": None,
                "uses": 0,
                "active": True,
                "expires_at": None,
                "created_at": datetime.now().isoformat()
            }
        ],
        "flash_sales": [],
        "bulk_rules": [
            {"min_qty": 3, "discount_percent": 5, "description": "Buy 3+, save 5%"},
            {"min_qty": 5, "discount_percent": 10, "description": "Buy 5+, save 10%"},
            {"min_qty": 10, "discount_percent": 15, "description": "Buy 10+, save 15%"}
        ],
        "settings": {
            "allow_stacking": False,
            "max_discount_percent": 50
        }
    }
    save_discounts(default_data)
    return default_data

def save_discounts(data: Dict):
    """Save discounts"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(DISCOUNTS_FILE, "w") as f:
        json.dump(data, f, indent=2)

def load_usage_log() -> List[Dict]:
    """Load discount usage log"""
    if USAGE_LOG_FILE.exists():
        with open(USAGE_LOG_FILE, "r") as f:
            return json.load(f)
    return []

def save_usage_log(log: List[Dict]):
    """Save usage log"""
    with open(USAGE_LOG_FILE, "w") as f:
        json.dump(log, f, indent=2)

def generate_code(prefix: str = "PAWSY", length: int = 6) -> str:
    """Generate a unique coupon code"""
    chars = string.ascii_uppercase + string.digits
    suffix = ''.join(random.choices(chars, k=length))
    return f"{prefix}{suffix}"

def create_coupon(
    code: str = None,
    discount_type: str = "percentage",
    value: float = 10,
    description: str = "",
    min_order: float = 0,
    max_uses: int = None,
    expires_days: int = None,
    first_order_only: bool = False,
    product_ids: List[str] = None,
    category: str = None
) -> Dict:
    """Create a new coupon"""
    data = load_discounts()
    
    if not code:
        code = generate_code()
    
    code = code.upper()
    
    # Check if code exists
    if any(c["code"] == code for c in data["coupons"]):
        return {"success": False, "error": "Code already exists"}
    
    expires_at = None
    if expires_days:
        expires_at = (datetime.now() + timedelta(days=expires_days)).isoformat()
    
    coupon = {
        "code": code,
        "type": discount_type,
        "value": value,
        "description": description or f"{value}{'%' if discount_type == 'percentage' else '$'} off",
        "min_order": min_order,
        "max_uses": max_uses,
        "uses": 0,
        "first_order_only": first_order_only,
        "product_ids": product_ids,
        "category": category,
        "active": True,
        "expires_at": expires_at,
        "created_at": datetime.now().isoformat()
    }
    
    data["coupons"].append(coupon)
    save_discounts(data)
    
    return {"success": True, "coupon": coupon}

def validate_coupon(code: str, order_total: float, user_id: str = None, 
                    is_first_order: bool = False, cart_items: List[Dict] = None) -> Dict:
    """Validate a coupon code"""
    data = load_discounts()
    code = code.upper()
    
    coupon = next((c for c in data["coupons"] if c["code"] == code), None)
    
    if not coupon:
        return {"valid": False, "error": "Invalid coupon code"}
    
    if not coupon.get("active"):
        return {"valid": False, "error": "This coupon is no longer active"}
    
    # Check expiration
    if coupon.get("expires_at"):
        expires = datetime.fromisoformat(coupon["expires_at"])
        if datetime.now() > expires:
            return {"valid": False, "error": "This coupon has expired"}
    
    # Check max uses
    if coupon.get("max_uses") and coupon.get("uses", 0) >= coupon["max_uses"]:
        return {"valid": False, "error": "This coupon has reached its usage limit"}
    
    # Check minimum order
    if order_total < coupon.get("min_order", 0):
        return {"valid": False, "error": f"Minimum order ${coupon['min_order']} required"}
    
    # Check first order only
    if coupon.get("first_order_only") and not is_first_order:
        return {"valid": False, "error": "This coupon is for first orders only"}
    
    # Calculate discount
    discount = calculate_discount(coupon, order_total, cart_items)
    
    return {
        "valid": True,
        "coupon": coupon,
        "discount": discount,
        "new_total": max(0, order_total - discount)
    }

def calculate_discount(coupon: Dict, order_total: float, cart_items: List[Dict] = None) -> float:
    """Calculate discount amount"""
    discount_type = coupon.get("type", "percentage")
    value = coupon.get("value", 0)
    
    if discount_type == "percentage":
        discount = order_total * (value / 100)
    elif discount_type == "fixed":
        discount = min(value, order_total)
    elif discount_type == "shipping":
        discount = 0  # Handled separately
    else:
        discount = 0
    
    # Apply max discount cap
    data = load_discounts()
    max_percent = data.get("settings", {}).get("max_discount_percent", 50)
    max_discount = order_total * (max_percent / 100)
    
    return min(discount, max_discount)

def apply_coupon(code: str, order_id: str, user_id: str, discount_amount: float) -> Dict:
    """Apply coupon to order and log usage"""
    data = load_discounts()
    code = code.upper()
    
    for coupon in data["coupons"]:
        if coupon["code"] == code:
            coupon["uses"] = coupon.get("uses", 0) + 1
            break
    
    save_discounts(data)
    
    # Log usage
    log = load_usage_log()
    log.append({
        "code": code,
        "order_id": order_id,
        "user_id": user_id,
        "discount_amount": discount_amount,
        "applied_at": datetime.now().isoformat()
    })
    save_usage_log(log)
    
    return {"success": True}

def create_flash_sale(
    name: str,
    discount_percent: float,
    product_ids: List[str] = None,
    category: str = None,
    duration_hours: int = 24
) -> Dict:
    """Create a flash sale"""
    data = load_discounts()
    
    flash_sale = {
        "id": f"flash_{int(datetime.now().timestamp())}",
        "name": name,
        "discount_percent": discount_percent,
        "product_ids": product_ids,
        "category": category,
        "active": True,
        "starts_at": datetime.now().isoformat(),
        "ends_at": (datetime.now() + timedelta(hours=duration_hours)).isoformat(),
        "created_at": datetime.now().isoformat()
    }
    
    data["flash_sales"].append(flash_sale)
    save_discounts(data)
    
    return {"success": True, "flash_sale": flash_sale}

def get_active_flash_sales() -> List[Dict]:
    """Get currently active flash sales"""
    data = load_discounts()
    now = datetime.now()
    
    active = []
    for sale in data.get("flash_sales", []):
        if not sale.get("active"):
            continue
        
        starts = datetime.fromisoformat(sale["starts_at"])
        ends = datetime.fromisoformat(sale["ends_at"])
        
        if starts <= now <= ends:
            # Calculate time remaining
            remaining = ends - now
            sale["hours_remaining"] = remaining.total_seconds() / 3600
            active.append(sale)
    
    return active

def get_bulk_discount(quantity: int) -> Optional[Dict]:
    """Get applicable bulk discount"""
    data = load_discounts()
    rules = data.get("bulk_rules", [])
    
    applicable = None
    for rule in sorted(rules, key=lambda x: x["min_qty"], reverse=True):
        if quantity >= rule["min_qty"]:
            applicable = rule
            break
    
    return applicable

def get_all_coupons() -> List[Dict]:
    """Get all coupons"""
    data = load_discounts()
    return data.get("coupons", [])

def deactivate_coupon(code: str) -> Dict:
    """Deactivate a coupon"""
    data = load_discounts()
    code = code.upper()
    
    for coupon in data["coupons"]:
        if coupon["code"] == code:
            coupon["active"] = False
            save_discounts(data)
            return {"success": True}
    
    return {"success": False, "error": "Coupon not found"}

def get_discount_stats() -> Dict:
    """Get discount statistics"""
    data = load_discounts()
    log = load_usage_log()
    
    total_coupons = len(data.get("coupons", []))
    active_coupons = len([c for c in data.get("coupons", []) if c.get("active")])
    active_flash_sales = len(get_active_flash_sales())
    
    total_uses = sum(c.get("uses", 0) for c in data.get("coupons", []))
    total_discount_given = sum(l.get("discount_amount", 0) for l in log)
    
    # Most popular coupons
    popular = sorted(data.get("coupons", []), key=lambda x: x.get("uses", 0), reverse=True)[:5]
    
    return {
        "total_coupons": total_coupons,
        "active_coupons": active_coupons,
        "active_flash_sales": active_flash_sales,
        "total_uses": total_uses,
        "total_discount_given": total_discount_given,
        "popular_coupons": [{"code": c["code"], "uses": c.get("uses", 0)} for c in popular],
        "bulk_rules": data.get("bulk_rules", [])
    }

if __name__ == "__main__":
    print("=== Dynamic Discount Engine V5.4 ===")
    print("\nDiscount Stats:")
    print(json.dumps(get_discount_stats(), indent=2))
    
    print("\nActive Coupons:")
    for c in get_all_coupons():
        if c.get("active"):
            print(f"  {c['code']}: {c['description']}")
