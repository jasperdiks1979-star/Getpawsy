#!/usr/bin/env python3
"""
GetPawsy Customer Segmentation AI V5.4
AI-powered customer segmentation for targeted marketing
"""

import os
import json
import requests
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from collections import defaultdict

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
SEGMENTS_FILE = DATA_DIR / "customer_segments.json"
USERS_FILE = DATA_DIR / "users.json"
ORDERS_FILE = DATA_DIR / "orders.json"

def get_openai_key():
    return os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")

def load_segments() -> Dict:
    """Load customer segments"""
    if SEGMENTS_FILE.exists():
        with open(SEGMENTS_FILE, "r") as f:
            return json.load(f)
    
    # Default segments
    default_segments = {
        "segments": {
            "vip": {
                "name": "VIP Customers",
                "description": "High-value repeat customers",
                "criteria": {"min_orders": 5, "min_total_spent": 500},
                "color": "#FFD700",
                "icon": "👑"
            },
            "regular": {
                "name": "Regular Customers",
                "description": "Active customers with repeat purchases",
                "criteria": {"min_orders": 2, "min_total_spent": 100},
                "color": "#10b981",
                "icon": "🌟"
            },
            "new": {
                "name": "New Customers",
                "description": "First-time buyers",
                "criteria": {"max_orders": 1},
                "color": "#3b82f6",
                "icon": "🆕"
            },
            "at_risk": {
                "name": "At-Risk Customers",
                "description": "Haven't purchased in 60+ days",
                "criteria": {"days_since_order": 60, "min_orders": 1},
                "color": "#f59e0b",
                "icon": "⚠️"
            },
            "dormant": {
                "name": "Dormant Customers",
                "description": "Inactive for 120+ days",
                "criteria": {"days_since_order": 120, "min_orders": 1},
                "color": "#ef4444",
                "icon": "💤"
            },
            "dog_lovers": {
                "name": "Dog Lovers",
                "description": "Primarily buy dog products",
                "criteria": {"category_preference": "dog"},
                "color": "#8b5cf6",
                "icon": "🐕"
            },
            "cat_lovers": {
                "name": "Cat Lovers",
                "description": "Primarily buy cat products",
                "criteria": {"category_preference": "cat"},
                "color": "#ec4899",
                "icon": "🐱"
            },
            "bargain_hunters": {
                "name": "Bargain Hunters",
                "description": "Frequently use coupons",
                "criteria": {"coupon_usage_rate": 0.5},
                "color": "#14b8a6",
                "icon": "💰"
            }
        },
        "customer_data": {},
        "last_analysis": None
    }
    save_segments(default_segments)
    return default_segments

def save_segments(data: Dict):
    """Save segments"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(SEGMENTS_FILE, "w") as f:
        json.dump(data, f, indent=2)

def load_users() -> List[Dict]:
    """Load users"""
    if USERS_FILE.exists():
        with open(USERS_FILE, "r") as f:
            return json.load(f)
    return []

def load_orders() -> List[Dict]:
    """Load orders"""
    # Check multiple possible order files
    order_files = [
        DATA_DIR / "orders.json",
        BASE_DIR / "orders" / "all_orders.json"
    ]
    
    for file in order_files:
        if file.exists():
            with open(file, "r") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
                return data.get("orders", [])
    return []

def analyze_customer(user_id: str, email: str, orders: List[Dict]) -> Dict:
    """Analyze a single customer's behavior"""
    user_orders = [o for o in orders if o.get("user_id") == user_id or o.get("email") == email]
    
    if not user_orders:
        return {
            "user_id": user_id,
            "email": email,
            "segments": ["potential"],
            "metrics": {}
        }
    
    # Calculate metrics
    total_orders = len(user_orders)
    total_spent = sum(o.get("total", 0) for o in user_orders)
    avg_order_value = total_spent / total_orders if total_orders > 0 else 0
    
    # Get dates
    order_dates = []
    for o in user_orders:
        try:
            if o.get("created_at"):
                order_dates.append(datetime.fromisoformat(o["created_at"].replace("Z", "+00:00")))
            elif o.get("date"):
                order_dates.append(datetime.fromisoformat(o["date"]))
        except:
            pass
    
    days_since_order = None
    first_order_date = None
    if order_dates:
        order_dates.sort()
        first_order_date = order_dates[0]
        days_since_order = (datetime.now() - order_dates[-1]).days
    
    # Analyze categories
    category_counts = defaultdict(int)
    for o in user_orders:
        for item in o.get("items", []):
            cat = item.get("category", "").lower()
            if "dog" in cat:
                category_counts["dog"] += 1
            elif "cat" in cat:
                category_counts["cat"] += 1
    
    category_preference = None
    if category_counts:
        category_preference = max(category_counts, key=category_counts.get)
    
    # Count coupon usage
    coupon_orders = sum(1 for o in user_orders if o.get("coupon_code"))
    coupon_usage_rate = coupon_orders / total_orders if total_orders > 0 else 0
    
    return {
        "user_id": user_id,
        "email": email,
        "metrics": {
            "total_orders": total_orders,
            "total_spent": total_spent,
            "avg_order_value": round(avg_order_value, 2),
            "days_since_order": days_since_order,
            "first_order_date": first_order_date.isoformat() if first_order_date else None,
            "category_preference": category_preference,
            "coupon_usage_rate": round(coupon_usage_rate, 2)
        }
    }

def assign_segments(customer: Dict) -> List[str]:
    """Assign segments based on customer metrics"""
    segments = []
    metrics = customer.get("metrics", {})
    data = load_segments()
    segment_defs = data.get("segments", {})
    
    total_orders = metrics.get("total_orders", 0)
    total_spent = metrics.get("total_spent", 0)
    days_since = metrics.get("days_since_order")
    category_pref = metrics.get("category_preference")
    coupon_rate = metrics.get("coupon_usage_rate", 0)
    
    # VIP
    if total_orders >= 5 and total_spent >= 500:
        segments.append("vip")
    
    # Regular
    elif total_orders >= 2 and total_spent >= 100:
        segments.append("regular")
    
    # New
    elif total_orders <= 1:
        segments.append("new")
    
    # At-risk or dormant
    if days_since is not None:
        if days_since >= 120:
            segments.append("dormant")
        elif days_since >= 60:
            segments.append("at_risk")
    
    # Category preferences
    if category_pref == "dog":
        segments.append("dog_lovers")
    elif category_pref == "cat":
        segments.append("cat_lovers")
    
    # Bargain hunters
    if coupon_rate >= 0.5 and total_orders >= 2:
        segments.append("bargain_hunters")
    
    return segments if segments else ["potential"]

def run_segmentation() -> Dict:
    """Run full customer segmentation analysis"""
    users = load_users()
    orders = load_orders()
    data = load_segments()
    
    results = {
        "analyzed": 0,
        "segment_counts": defaultdict(int),
        "customers": []
    }
    
    for user in users:
        user_id = str(user.get("id", ""))
        email = user.get("email", "")
        
        if not email:
            continue
        
        # Analyze customer
        customer = analyze_customer(user_id, email, orders)
        
        # Assign segments
        customer["segments"] = assign_segments(customer)
        
        # Store in data
        data["customer_data"][user_id] = customer
        
        # Count segments
        for seg in customer["segments"]:
            results["segment_counts"][seg] += 1
        
        results["customers"].append({
            "user_id": user_id,
            "email": email,
            "segments": customer["segments"],
            "total_spent": customer["metrics"].get("total_spent", 0)
        })
        
        results["analyzed"] += 1
    
    data["last_analysis"] = datetime.now().isoformat()
    save_segments(data)
    
    results["segment_counts"] = dict(results["segment_counts"])
    return results

def get_segment_customers(segment_id: str) -> List[Dict]:
    """Get all customers in a segment"""
    data = load_segments()
    customers = []
    
    for user_id, customer in data.get("customer_data", {}).items():
        if segment_id in customer.get("segments", []):
            customers.append(customer)
    
    return sorted(customers, key=lambda x: x.get("metrics", {}).get("total_spent", 0), reverse=True)

def get_ai_segment_insights(segment_id: str) -> str:
    """Get AI-generated insights for a segment"""
    api_key = get_openai_key()
    if not api_key:
        return "AI insights not available - API key not configured."
    
    data = load_segments()
    segment = data.get("segments", {}).get(segment_id)
    customers = get_segment_customers(segment_id)
    
    if not segment or not customers:
        return "No data available for this segment."
    
    # Prepare summary
    total_customers = len(customers)
    total_revenue = sum(c.get("metrics", {}).get("total_spent", 0) for c in customers)
    avg_orders = sum(c.get("metrics", {}).get("total_orders", 0) for c in customers) / max(total_customers, 1)
    
    context = f"""
    Segment: {segment['name']}
    Description: {segment['description']}
    Total customers: {total_customers}
    Total revenue: ${total_revenue:.2f}
    Average orders per customer: {avg_orders:.1f}
    """
    
    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a marketing expert for GetPawsy, a pet store. Provide 3 actionable insights for engaging this customer segment. Be concise and specific."
                    },
                    {
                        "role": "user",
                        "content": f"Provide marketing insights for this segment:\n{context}"
                    }
                ],
                "max_tokens": 300,
                "temperature": 0.7
            },
            timeout=15
        )
        
        if response.status_code == 200:
            return response.json()["choices"][0]["message"]["content"]
    except:
        pass
    
    return "Unable to generate AI insights at this time."

def create_custom_segment(
    segment_id: str,
    name: str,
    description: str,
    criteria: Dict,
    color: str = "#6366f1",
    icon: str = "📊"
) -> Dict:
    """Create a custom segment"""
    data = load_segments()
    
    if segment_id in data["segments"]:
        return {"success": False, "error": "Segment ID already exists"}
    
    data["segments"][segment_id] = {
        "name": name,
        "description": description,
        "criteria": criteria,
        "color": color,
        "icon": icon,
        "custom": True,
        "created_at": datetime.now().isoformat()
    }
    
    save_segments(data)
    return {"success": True, "segment": data["segments"][segment_id]}

def get_segment_summary() -> Dict:
    """Get summary of all segments"""
    data = load_segments()
    segments = data.get("segments", {})
    customer_data = data.get("customer_data", {})
    
    summary = []
    for seg_id, seg in segments.items():
        customers = [c for c in customer_data.values() if seg_id in c.get("segments", [])]
        total_revenue = sum(c.get("metrics", {}).get("total_spent", 0) for c in customers)
        
        summary.append({
            "id": seg_id,
            "name": seg["name"],
            "description": seg["description"],
            "icon": seg.get("icon", "📊"),
            "color": seg.get("color", "#6366f1"),
            "customer_count": len(customers),
            "total_revenue": round(total_revenue, 2)
        })
    
    return {
        "segments": sorted(summary, key=lambda x: x["customer_count"], reverse=True),
        "last_analysis": data.get("last_analysis"),
        "total_customers": len(customer_data)
    }

if __name__ == "__main__":
    print("=== Customer Segmentation AI V5.4 ===")
    
    print("\nRunning segmentation analysis...")
    results = run_segmentation()
    print(f"Analyzed {results['analyzed']} customers")
    print(f"Segment counts: {results['segment_counts']}")
    
    print("\nSegment Summary:")
    summary = get_segment_summary()
    for seg in summary["segments"]:
        print(f"  {seg['icon']} {seg['name']}: {seg['customer_count']} customers, ${seg['total_revenue']:.2f} revenue")
