"""
GetPawsy ULTRA V5.6 - AI Customer Profile Engine
Builds AI-powered customer profiles from behavior, purchases, chat history, and returns
"""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
PROFILES_FILE = DATA_DIR / "customer_profiles.json"

BUDGET_LEVELS = {
    "budget": {"max_avg_order": 25, "label": "Budget Conscious"},
    "moderate": {"max_avg_order": 50, "label": "Moderate Spender"},
    "premium": {"max_avg_order": 100, "label": "Premium Buyer"},
    "luxury": {"max_avg_order": float('inf'), "label": "Luxury Shopper"}
}

INTEREST_CATEGORIES = [
    "toys", "food", "treats", "beds", "clothing", "grooming", 
    "health", "accessories", "outdoor", "training"
]

def load_profiles():
    if PROFILES_FILE.exists():
        with open(PROFILES_FILE, 'r') as f:
            return json.load(f)
    return {"profiles": []}

def save_profiles(data):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(PROFILES_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def load_json_file(filename):
    filepath = DATA_DIR / filename
    if filepath.exists():
        with open(filepath, 'r') as f:
            return json.load(f)
    return {}

def get_profile(user_id):
    data = load_profiles()
    for profile in data.get("profiles", []):
        if str(profile.get("user_id")) == str(user_id):
            return profile
    return None

def analyze_browsing_behavior(user_id):
    try:
        behavior_data = load_json_file("behavior.json")
        user_behavior = behavior_data.get(str(user_id), {})
        
        viewed_products = user_behavior.get("viewed_products", [])
        categories_viewed = {}
        
        for view in viewed_products:
            cat = view.get("category", "general")
            categories_viewed[cat] = categories_viewed.get(cat, 0) + 1
        
        return {
            "total_views": len(viewed_products),
            "categories": categories_viewed,
            "avg_time_on_site": user_behavior.get("avg_session_time", 0),
            "pages_per_session": user_behavior.get("pages_per_session", 0)
        }
    except:
        return {"total_views": 0, "categories": {}, "avg_time_on_site": 0, "pages_per_session": 0}

def analyze_cart_activity(user_id):
    try:
        carts_data = load_json_file("abandoned_carts.json")
        user_carts = [c for c in carts_data.get("carts", []) if str(c.get("user_id")) == str(user_id)]
        
        abandoned_count = sum(1 for c in user_carts if c.get("status") == "abandoned")
        converted_count = sum(1 for c in user_carts if c.get("status") == "converted")
        
        return {
            "total_carts": len(user_carts),
            "abandoned": abandoned_count,
            "converted": converted_count,
            "abandonment_rate": abandoned_count / len(user_carts) if user_carts else 0
        }
    except:
        return {"total_carts": 0, "abandoned": 0, "converted": 0, "abandonment_rate": 0}

def analyze_purchase_history(user_id):
    try:
        orders_data = load_json_file("orders.json")
        user_orders = [o for o in orders_data.get("orders", []) if str(o.get("user_id")) == str(user_id)]
        
        if not user_orders:
            return {"total_orders": 0, "total_spent": 0, "avg_order_value": 0, "favorite_categories": []}
        
        total_spent = sum(o.get("total", 0) for o in user_orders)
        avg_order = total_spent / len(user_orders)
        
        category_counts = {}
        for order in user_orders:
            for item in order.get("items", []):
                cat = item.get("category", "general")
                category_counts[cat] = category_counts.get(cat, 0) + 1
        
        favorite_cats = sorted(category_counts.items(), key=lambda x: x[1], reverse=True)[:3]
        
        return {
            "total_orders": len(user_orders),
            "total_spent": total_spent,
            "avg_order_value": avg_order,
            "favorite_categories": [c[0] for c in favorite_cats],
            "last_order_date": max(o.get("created_at", "") for o in user_orders) if user_orders else None
        }
    except:
        return {"total_orders": 0, "total_spent": 0, "avg_order_value": 0, "favorite_categories": []}

def analyze_chat_history(user_id):
    try:
        chat_data = load_json_file("chat_history.json")
        user_chats = chat_data.get(str(user_id), [])
        
        pet_mentions = {"dog": 0, "cat": 0}
        topics = {}
        
        for msg in user_chats:
            text = msg.get("message", "").lower()
            if "dog" in text or "puppy" in text:
                pet_mentions["dog"] += 1
            if "cat" in text or "kitten" in text:
                pet_mentions["cat"] += 1
            
            for topic in ["toy", "food", "bed", "treat", "health", "training"]:
                if topic in text:
                    topics[topic] = topics.get(topic, 0) + 1
        
        return {
            "total_messages": len(user_chats),
            "pet_mentions": pet_mentions,
            "topics_discussed": topics
        }
    except:
        return {"total_messages": 0, "pet_mentions": {"dog": 0, "cat": 0}, "topics_discussed": {}}

def analyze_return_patterns(user_id):
    try:
        returns_data = load_json_file("returns.json")
        user_returns = [r for r in returns_data.get("returns", []) if str(r.get("user_id")) == str(user_id)]
        
        reason_counts = {}
        for ret in user_returns:
            reason = ret.get("classified_reason", "other")
            reason_counts[reason] = reason_counts.get(reason, 0) + 1
        
        return {
            "total_returns": len(user_returns),
            "return_reasons": reason_counts,
            "avg_risk_score": sum(r.get("risk_score", 0) for r in user_returns) / len(user_returns) if user_returns else 0
        }
    except:
        return {"total_returns": 0, "return_reasons": {}, "avg_risk_score": 0}

def determine_pet_type(browsing, chat, purchases):
    dog_score = 0
    cat_score = 0
    
    dog_score += chat.get("pet_mentions", {}).get("dog", 0) * 2
    cat_score += chat.get("pet_mentions", {}).get("cat", 0) * 2
    
    for cat in purchases.get("favorite_categories", []):
        if "dog" in cat.lower():
            dog_score += 3
        if "cat" in cat.lower():
            cat_score += 3
    
    if dog_score > cat_score:
        return "dog"
    elif cat_score > dog_score:
        return "cat"
    else:
        return "both"

def determine_budget_level(avg_order_value):
    for level, config in sorted(BUDGET_LEVELS.items(), key=lambda x: x[1]["max_avg_order"]):
        if avg_order_value <= config["max_avg_order"]:
            return level
    return "luxury"

def calculate_purchase_intent(browsing, cart):
    intent_score = 0
    
    intent_score += min(browsing.get("total_views", 0) * 2, 30)
    intent_score += browsing.get("pages_per_session", 0) * 5
    
    if cart.get("total_carts", 0) > 0:
        intent_score += 20
        conversion_rate = cart.get("converted", 0) / cart.get("total_carts", 1)
        intent_score += int(conversion_rate * 30)
    
    if intent_score > 70:
        return "high"
    elif intent_score > 40:
        return "medium"
    else:
        return "low"

def calculate_churn_risk(purchases, cart, returns):
    risk_score = 50
    
    if purchases.get("total_orders", 0) == 0:
        risk_score += 20
    
    last_order = purchases.get("last_order_date")
    if last_order:
        try:
            days_since = (datetime.now() - datetime.fromisoformat(last_order)).days
            if days_since > 90:
                risk_score += 25
            elif days_since > 60:
                risk_score += 15
            elif days_since > 30:
                risk_score += 5
            else:
                risk_score -= 20
        except:
            pass
    
    if cart.get("abandonment_rate", 0) > 0.5:
        risk_score += 15
    
    if returns.get("total_returns", 0) > 2:
        risk_score += 10
    
    if risk_score > 70:
        return "high"
    elif risk_score > 40:
        return "medium"
    else:
        return "low"

def build_profile(user_id, user_email=None, user_name=None):
    browsing = analyze_browsing_behavior(user_id)
    cart = analyze_cart_activity(user_id)
    purchases = analyze_purchase_history(user_id)
    chat = analyze_chat_history(user_id)
    returns = analyze_return_patterns(user_id)
    
    pet_type = determine_pet_type(browsing, chat, purchases)
    budget_level = determine_budget_level(purchases.get("avg_order_value", 0))
    purchase_intent = calculate_purchase_intent(browsing, cart)
    churn_risk = calculate_churn_risk(purchases, cart, returns)
    
    interest_categories = purchases.get("favorite_categories", [])
    if not interest_categories and browsing.get("categories"):
        interest_categories = sorted(browsing["categories"].items(), key=lambda x: x[1], reverse=True)[:3]
        interest_categories = [c[0] for c in interest_categories]
    
    profile = {
        "user_id": str(user_id),
        "email": user_email,
        "name": user_name,
        "pet_type": pet_type,
        "breed": None,
        "interest_categories": interest_categories,
        "budget_level": budget_level,
        "purchase_intent": purchase_intent,
        "churn_risk": churn_risk,
        "analysis": {
            "browsing": browsing,
            "cart": cart,
            "purchases": purchases,
            "chat": chat,
            "returns": returns
        },
        "recommendations": generate_recommendations(pet_type, interest_categories, budget_level),
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat()
    }
    
    data = load_profiles()
    existing_idx = None
    for i, p in enumerate(data.get("profiles", [])):
        if str(p.get("user_id")) == str(user_id):
            existing_idx = i
            break
    
    if existing_idx is not None:
        profile["created_at"] = data["profiles"][existing_idx].get("created_at", profile["created_at"])
        data["profiles"][existing_idx] = profile
    else:
        data["profiles"].append(profile)
    
    save_profiles(data)
    return profile

def generate_recommendations(pet_type, interests, budget):
    recs = []
    
    if pet_type in ["dog", "both"]:
        recs.append("Recommend dog toys and treats based on activity level")
    if pet_type in ["cat", "both"]:
        recs.append("Suggest cat toys and comfort items")
    
    if budget == "budget":
        recs.append("Highlight value packs and bundles")
        recs.append("Show products under $25")
    elif budget in ["premium", "luxury"]:
        recs.append("Feature premium and exclusive products")
        recs.append("Suggest subscription boxes")
    
    if "toys" in interests:
        recs.append("New toy arrivals and bestsellers")
    if "food" in interests or "treats" in interests:
        recs.append("Healthy treat options and food toppers")
    
    return recs[:5]

def get_all_profiles():
    data = load_profiles()
    return data.get("profiles", [])

def get_profile_stats():
    profiles = get_all_profiles()
    
    return {
        "total_profiles": len(profiles),
        "pet_types": {
            "dog": sum(1 for p in profiles if p.get("pet_type") == "dog"),
            "cat": sum(1 for p in profiles if p.get("pet_type") == "cat"),
            "both": sum(1 for p in profiles if p.get("pet_type") == "both")
        },
        "churn_risk": {
            "high": sum(1 for p in profiles if p.get("churn_risk") == "high"),
            "medium": sum(1 for p in profiles if p.get("churn_risk") == "medium"),
            "low": sum(1 for p in profiles if p.get("churn_risk") == "low")
        },
        "budget_levels": {
            level: sum(1 for p in profiles if p.get("budget_level") == level)
            for level in BUDGET_LEVELS.keys()
        }
    }

if __name__ == "__main__":
    print("Profile AI Engine V1 - GetPawsy ULTRA V5.6")
    print("Testing...")
    
    profile = build_profile("test-user-1", "test@example.com", "Test User")
    print(f"Built profile for {profile['user_id']}")
    print(f"Pet type: {profile['pet_type']}")
    print(f"Budget level: {profile['budget_level']}")
    print(f"Churn risk: {profile['churn_risk']}")
