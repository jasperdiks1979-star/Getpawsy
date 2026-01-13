#!/usr/bin/env python3
"""
GetPawsy Analytics Dashboard V2
Track page views, clicks, AI chat actions, cart events, and purchase flow
"""

import os
import json
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
ANALYTICS_FILE = DATA_DIR / "analytics_v2.json"

def load_analytics():
    """Load analytics data"""
    if ANALYTICS_FILE.exists():
        with open(ANALYTICS_FILE, "r") as f:
            return json.load(f)
    return {
        "page_views": [],
        "clicks": [],
        "chat_actions": [],
        "cart_events": [],
        "purchases": [],
        "sessions": {}
    }

def save_analytics(data):
    """Save analytics data"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(ANALYTICS_FILE, "w") as f:
        json.dump(data, f, indent=2)

def track_page_view(page, user_id=None, session_id=None, referrer=None):
    """Track a page view"""
    data = load_analytics()
    
    event = {
        "page": page,
        "user_id": user_id,
        "session_id": session_id,
        "referrer": referrer,
        "timestamp": datetime.now().isoformat()
    }
    
    data["page_views"].append(event)
    
    if len(data["page_views"]) > 10000:
        data["page_views"] = data["page_views"][-10000:]
    
    save_analytics(data)
    return event

def track_click(element, page, coords=None, user_id=None, session_id=None):
    """Track a click event for heatmaps"""
    data = load_analytics()
    
    event = {
        "element": element,
        "page": page,
        "coords": coords,
        "user_id": user_id,
        "session_id": session_id,
        "timestamp": datetime.now().isoformat()
    }
    
    data["clicks"].append(event)
    
    if len(data["clicks"]) > 50000:
        data["clicks"] = data["clicks"][-50000:]
    
    save_analytics(data)
    return event

def track_scroll_depth(page, depth, user_id=None, session_id=None):
    """Track scroll depth"""
    data = load_analytics()
    
    if "scroll_depth" not in data:
        data["scroll_depth"] = []
    
    event = {
        "page": page,
        "depth": depth,
        "user_id": user_id,
        "session_id": session_id,
        "timestamp": datetime.now().isoformat()
    }
    
    data["scroll_depth"].append(event)
    save_analytics(data)
    return event

def track_chat_action(action, query, response=None, user_id=None, session_id=None):
    """Track AI chat actions"""
    data = load_analytics()
    
    event = {
        "action": action,
        "query": query,
        "response": response,
        "user_id": user_id,
        "session_id": session_id,
        "timestamp": datetime.now().isoformat()
    }
    
    data["chat_actions"].append(event)
    
    if len(data["chat_actions"]) > 10000:
        data["chat_actions"] = data["chat_actions"][-10000:]
    
    save_analytics(data)
    return event

def track_cart_event(event_type, product_id, quantity=1, user_id=None, session_id=None):
    """Track cart events (add, remove, update)"""
    data = load_analytics()
    
    event = {
        "type": event_type,
        "product_id": product_id,
        "quantity": quantity,
        "user_id": user_id,
        "session_id": session_id,
        "timestamp": datetime.now().isoformat()
    }
    
    data["cart_events"].append(event)
    save_analytics(data)
    return event

def track_purchase(order_id, products, total, user_id=None, session_id=None):
    """Track a purchase"""
    data = load_analytics()
    
    event = {
        "order_id": order_id,
        "products": products,
        "total": total,
        "user_id": user_id,
        "session_id": session_id,
        "timestamp": datetime.now().isoformat()
    }
    
    data["purchases"].append(event)
    save_analytics(data)
    return event

def get_page_view_stats(days=7):
    """Get page view statistics"""
    data = load_analytics()
    cutoff = datetime.now() - timedelta(days=days)
    
    views = [v for v in data.get("page_views", []) 
             if datetime.fromisoformat(v["timestamp"]) > cutoff]
    
    by_page = defaultdict(int)
    by_day = defaultdict(int)
    
    for view in views:
        by_page[view["page"]] += 1
        day = view["timestamp"][:10]
        by_day[day] += 1
    
    return {
        "total_views": len(views),
        "by_page": dict(sorted(by_page.items(), key=lambda x: x[1], reverse=True)[:20]),
        "by_day": dict(sorted(by_day.items()))
    }

def get_heatmap_data(page, days=7):
    """Get click heatmap data for a page"""
    data = load_analytics()
    cutoff = datetime.now() - timedelta(days=days)
    
    clicks = [c for c in data.get("clicks", [])
              if c["page"] == page and c.get("coords") and
              datetime.fromisoformat(c["timestamp"]) > cutoff]
    
    return {
        "page": page,
        "click_count": len(clicks),
        "coords": [c["coords"] for c in clicks if c.get("coords")]
    }

def get_scroll_depth_stats(page=None, days=7):
    """Get scroll depth statistics"""
    data = load_analytics()
    cutoff = datetime.now() - timedelta(days=days)
    
    depths = data.get("scroll_depth", [])
    if page:
        depths = [d for d in depths if d["page"] == page]
    
    depths = [d for d in depths if datetime.fromisoformat(d["timestamp"]) > cutoff]
    
    depth_buckets = {25: 0, 50: 0, 75: 0, 100: 0}
    for d in depths:
        depth = d.get("depth", 0)
        for bucket in [25, 50, 75, 100]:
            if depth >= bucket:
                depth_buckets[bucket] += 1
    
    return {
        "total_sessions": len(depths),
        "depth_distribution": depth_buckets
    }

def get_intent_clusters(days=7):
    """Analyze chat intent clusters"""
    data = load_analytics()
    cutoff = datetime.now() - timedelta(days=days)
    
    actions = [a for a in data.get("chat_actions", [])
               if datetime.fromisoformat(a["timestamp"]) > cutoff]
    
    intents = defaultdict(int)
    for action in actions:
        intent = action.get("action", "unknown")
        intents[intent] += 1
    
    return {
        "total_chat_actions": len(actions),
        "intent_distribution": dict(sorted(intents.items(), key=lambda x: x[1], reverse=True))
    }

def get_conversion_funnel(days=7):
    """Get conversion funnel data"""
    data = load_analytics()
    cutoff = datetime.now() - timedelta(days=days)
    
    page_views = len([v for v in data.get("page_views", [])
                      if datetime.fromisoformat(v["timestamp"]) > cutoff])
    
    product_views = len([v for v in data.get("page_views", [])
                         if "/products/" in v["page"] and
                         datetime.fromisoformat(v["timestamp"]) > cutoff])
    
    cart_adds = len([e for e in data.get("cart_events", [])
                     if e["type"] == "add" and
                     datetime.fromisoformat(e["timestamp"]) > cutoff])
    
    checkouts = len([v for v in data.get("page_views", [])
                     if "/checkout" in v["page"] and
                     datetime.fromisoformat(v["timestamp"]) > cutoff])
    
    purchases = len([p for p in data.get("purchases", [])
                     if datetime.fromisoformat(p["timestamp"]) > cutoff])
    
    return {
        "funnel": {
            "page_views": page_views,
            "product_views": product_views,
            "cart_adds": cart_adds,
            "checkouts": checkouts,
            "purchases": purchases
        },
        "conversion_rates": {
            "view_to_product": round(product_views / max(page_views, 1) * 100, 2),
            "product_to_cart": round(cart_adds / max(product_views, 1) * 100, 2),
            "cart_to_checkout": round(checkouts / max(cart_adds, 1) * 100, 2),
            "checkout_to_purchase": round(purchases / max(checkouts, 1) * 100, 2),
            "overall": round(purchases / max(page_views, 1) * 100, 2)
        }
    }

def get_chat_to_cart_funnel(days=7):
    """Get chat-to-cart conversion funnel"""
    data = load_analytics()
    cutoff = datetime.now() - timedelta(days=days)
    
    chat_sessions = set()
    chat_add_intents = set()
    
    for action in data.get("chat_actions", []):
        if datetime.fromisoformat(action["timestamp"]) > cutoff:
            session = action.get("session_id")
            if session:
                chat_sessions.add(session)
                if action.get("action") == "add":
                    chat_add_intents.add(session)
    
    cart_sessions = set()
    for event in data.get("cart_events", []):
        if datetime.fromisoformat(event["timestamp"]) > cutoff:
            session = event.get("session_id")
            if session and event["type"] == "add":
                cart_sessions.add(session)
    
    chat_to_cart = chat_add_intents & cart_sessions
    
    return {
        "total_chat_sessions": len(chat_sessions),
        "chat_add_intents": len(chat_add_intents),
        "resulting_cart_adds": len(chat_to_cart),
        "chat_cart_conversion": round(len(chat_to_cart) / max(len(chat_add_intents), 1) * 100, 2)
    }

def get_dashboard_summary(days=7):
    """Get complete dashboard summary"""
    return {
        "page_views": get_page_view_stats(days),
        "scroll_depth": get_scroll_depth_stats(days=days),
        "intent_clusters": get_intent_clusters(days),
        "conversion_funnel": get_conversion_funnel(days),
        "chat_to_cart": get_chat_to_cart_funnel(days),
        "generated_at": datetime.now().isoformat()
    }

if __name__ == "__main__":
    summary = get_dashboard_summary()
    print(json.dumps(summary, indent=2))
