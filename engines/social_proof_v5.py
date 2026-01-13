#!/usr/bin/env python3
"""
GetPawsy Social Proof Engine V5.4
Live purchase notifications and social proof widgets
"""

import os
import json
import random
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
SOCIAL_PROOF_FILE = DATA_DIR / "social_proof_events.json"
PRODUCTS_FILE = DATA_DIR / "products_v5.json"

# Notification templates
TEMPLATES = {
    "purchase": [
        "{name} from {location} just bought {product}",
        "Someone in {location} purchased {product}",
        "🎉 {name} just ordered {product}!",
        "Hot item! {product} was just bought by {name}"
    ],
    "viewing": [
        "{count} people are viewing this right now",
        "{count} shoppers looking at this product"
    ],
    "cart_add": [
        "{name} added {product} to their cart",
        "Popular choice! {name} just added {product}"
    ],
    "stock_low": [
        "Only {count} left in stock!",
        "Hurry! Just {count} remaining"
    ],
    "review": [
        "{name} just left a ⭐⭐⭐⭐⭐ review!",
        "New review from {name}: \"{review}\""
    ]
}

# Sample first names for demo
FIRST_NAMES = [
    "Emma", "Liam", "Olivia", "Noah", "Ava", "Oliver", "Isabella", "William",
    "Sophia", "James", "Charlotte", "Benjamin", "Mia", "Lucas", "Amelia",
    "Sarah", "Michael", "Jessica", "David", "Ashley", "Chris", "Rachel"
]

# Sample locations
LOCATIONS = [
    "New York, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX",
    "Phoenix, AZ", "Philadelphia, PA", "San Antonio, TX", "San Diego, CA",
    "Dallas, TX", "Austin, TX", "Seattle, WA", "Denver, CO", "Boston, MA",
    "Portland, OR", "Miami, FL", "Atlanta, GA", "Nashville, TN"
]

def load_events() -> Dict:
    """Load social proof events"""
    if SOCIAL_PROOF_FILE.exists():
        with open(SOCIAL_PROOF_FILE, "r") as f:
            return json.load(f)
    return {"events": [], "settings": {"enabled": True, "display_duration": 5000}}

def save_events(data: Dict):
    """Save social proof events"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(SOCIAL_PROOF_FILE, "w") as f:
        json.dump(data, f, indent=2)

def load_products() -> List[Dict]:
    """Load products for demo"""
    if PRODUCTS_FILE.exists():
        with open(PRODUCTS_FILE, "r") as f:
            data = json.load(f)
            return data.get("products", [])
    return []

def log_event(event_type: str, product_id: str = None, product_name: str = None, 
              customer_name: str = None, location: str = None, extra: Dict = None) -> Dict:
    """Log a social proof event"""
    data = load_events()
    
    event = {
        "id": f"sp_{int(datetime.now().timestamp())}_{random.randint(1000, 9999)}",
        "type": event_type,
        "product_id": product_id,
        "product_name": product_name,
        "customer_name": customer_name or random.choice(FIRST_NAMES),
        "location": location or random.choice(LOCATIONS),
        "created_at": datetime.now().isoformat(),
        "extra": extra or {}
    }
    
    data["events"].append(event)
    
    # Keep only last 100 events
    data["events"] = data["events"][-100:]
    
    save_events(data)
    return event

def get_recent_events(limit: int = 10, event_type: str = None) -> List[Dict]:
    """Get recent social proof events"""
    data = load_events()
    events = data.get("events", [])
    
    if event_type:
        events = [e for e in events if e.get("type") == event_type]
    
    # Sort by most recent
    events = sorted(events, key=lambda x: x.get("created_at", ""), reverse=True)
    
    return events[:limit]

def generate_notification(event: Dict) -> Dict:
    """Generate a notification from an event"""
    event_type = event.get("type", "purchase")
    templates = TEMPLATES.get(event_type, TEMPLATES["purchase"])
    template = random.choice(templates)
    
    message = template.format(
        name=event.get("customer_name", "Someone"),
        location=event.get("location", "nearby"),
        product=event.get("product_name", "a great product"),
        count=event.get("extra", {}).get("count", random.randint(2, 15)),
        review=event.get("extra", {}).get("review", "Love it!")[:50]
    )
    
    return {
        "id": event.get("id"),
        "message": message,
        "type": event_type,
        "product_id": event.get("product_id"),
        "product_name": event.get("product_name"),
        "timestamp": event.get("created_at"),
        "icon": get_event_icon(event_type)
    }

def get_event_icon(event_type: str) -> str:
    """Get icon for event type"""
    icons = {
        "purchase": "🛒",
        "viewing": "👀",
        "cart_add": "🛍️",
        "stock_low": "🔥",
        "review": "⭐"
    }
    return icons.get(event_type, "🐾")

def get_notification_feed(limit: int = 5) -> List[Dict]:
    """Get notifications for display on site"""
    events = get_recent_events(limit=limit)
    return [generate_notification(e) for e in events]

def generate_demo_events(count: int = 10) -> List[Dict]:
    """Generate demo events for testing"""
    products = load_products()
    if not products:
        products = [
            {"id": "demo1", "name": "Premium Dog Toy"},
            {"id": "demo2", "name": "Cat Scratching Post"},
            {"id": "demo3", "name": "Pet Bed Deluxe"}
        ]
    
    events = []
    for i in range(count):
        product = random.choice(products)
        event_type = random.choice(["purchase", "cart_add", "viewing"])
        
        event = log_event(
            event_type=event_type,
            product_id=product.get("id"),
            product_name=product.get("name"),
            customer_name=random.choice(FIRST_NAMES),
            location=random.choice(LOCATIONS),
            extra={"count": random.randint(2, 20)}
        )
        events.append(event)
    
    return events

def get_live_viewer_count(product_id: str = None) -> int:
    """Get simulated live viewer count"""
    base = random.randint(3, 25)
    # Add some variation based on time of day
    hour = datetime.now().hour
    if 9 <= hour <= 21:  # Peak hours
        base = int(base * 1.5)
    return base

def get_sales_count_today() -> int:
    """Get today's sales count"""
    data = load_events()
    today = datetime.now().date()
    
    purchases = [
        e for e in data.get("events", [])
        if e.get("type") == "purchase" and 
        datetime.fromisoformat(e.get("created_at", "2020-01-01")).date() == today
    ]
    
    return len(purchases)

def get_social_proof_widget_data(product_id: str = None) -> Dict:
    """Get all data needed for social proof widget"""
    return {
        "notifications": get_notification_feed(limit=5),
        "live_viewers": get_live_viewer_count(product_id),
        "sales_today": get_sales_count_today(),
        "recent_purchases": get_recent_events(limit=3, event_type="purchase"),
        "settings": load_events().get("settings", {})
    }

def get_stats() -> Dict:
    """Get social proof statistics"""
    data = load_events()
    events = data.get("events", [])
    
    by_type = {}
    for e in events:
        t = e.get("type", "unknown")
        by_type[t] = by_type.get(t, 0) + 1
    
    return {
        "total_events": len(events),
        "by_type": by_type,
        "settings": data.get("settings", {})
    }

# JavaScript widget code generator
def get_widget_js() -> str:
    """Generate JavaScript code for social proof widget"""
    return """
// GetPawsy Social Proof Widget V5.4
(function() {
    const SOCIAL_PROOF_API = '/api/social-proof/feed';
    const DISPLAY_DURATION = 5000;
    const POLL_INTERVAL = 30000;
    
    let notificationQueue = [];
    let isShowing = false;
    
    // Create widget container
    const container = document.createElement('div');
    container.id = 'pawsy-social-proof';
    container.innerHTML = `
        <style>
            #pawsy-social-proof-popup {
                position: fixed;
                bottom: 20px;
                left: 20px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                padding: 15px 20px;
                display: flex;
                align-items: center;
                gap: 12px;
                max-width: 350px;
                transform: translateX(-120%);
                transition: transform 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
                z-index: 9999;
                font-family: 'Segoe UI', Arial, sans-serif;
            }
            #pawsy-social-proof-popup.show {
                transform: translateX(0);
            }
            .sp-icon {
                font-size: 24px;
                min-width: 40px;
                height: 40px;
                background: linear-gradient(135deg, #667eea, #764ba2);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .sp-content {
                flex: 1;
            }
            .sp-message {
                font-size: 14px;
                color: #333;
                margin: 0;
            }
            .sp-time {
                font-size: 11px;
                color: #999;
                margin-top: 4px;
            }
            .sp-close {
                cursor: pointer;
                color: #999;
                font-size: 18px;
            }
        </style>
        <div id="pawsy-social-proof-popup">
            <div class="sp-icon">🛒</div>
            <div class="sp-content">
                <p class="sp-message"></p>
                <div class="sp-time">Just now</div>
            </div>
            <span class="sp-close">×</span>
        </div>
    `;
    document.body.appendChild(container);
    
    const popup = document.getElementById('pawsy-social-proof-popup');
    const messageEl = popup.querySelector('.sp-message');
    const iconEl = popup.querySelector('.sp-icon');
    const closeEl = popup.querySelector('.sp-close');
    
    closeEl.addEventListener('click', () => {
        popup.classList.remove('show');
        isShowing = false;
    });
    
    function showNotification(notification) {
        if (isShowing) {
            notificationQueue.push(notification);
            return;
        }
        
        isShowing = true;
        messageEl.textContent = notification.message;
        iconEl.textContent = notification.icon || '🐾';
        popup.classList.add('show');
        
        setTimeout(() => {
            popup.classList.remove('show');
            setTimeout(() => {
                isShowing = false;
                if (notificationQueue.length > 0) {
                    showNotification(notificationQueue.shift());
                }
            }, 400);
        }, DISPLAY_DURATION);
    }
    
    async function fetchNotifications() {
        try {
            const response = await fetch(SOCIAL_PROOF_API);
            const data = await response.json();
            if (data.notifications && data.notifications.length > 0) {
                const random = data.notifications[Math.floor(Math.random() * data.notifications.length)];
                showNotification(random);
            }
        } catch (e) {
            console.log('Social proof fetch error:', e);
        }
    }
    
    // Initial fetch after 5 seconds
    setTimeout(fetchNotifications, 5000);
    
    // Poll for new notifications
    setInterval(fetchNotifications, POLL_INTERVAL);
})();
"""

if __name__ == "__main__":
    print("=== Social Proof Engine V5.4 ===")
    
    print("\nGenerating demo events...")
    events = generate_demo_events(10)
    print(f"Created {len(events)} demo events")
    
    print("\nNotification Feed:")
    feed = get_notification_feed(5)
    for n in feed:
        print(f"  {n['icon']} {n['message']}")
    
    print("\nWidget Data:")
    print(json.dumps(get_social_proof_widget_data(), indent=2, default=str))
