#!/usr/bin/env python3
"""
GetPawsy Smart Email Marketing Engine V5.4
Automated email campaigns and newsletters
"""

import os
import json
import requests
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
CAMPAIGNS_FILE = DATA_DIR / "email_campaigns.json"
SUBSCRIBERS_FILE = DATA_DIR / "email_subscribers.json"
TEMPLATES_FILE = DATA_DIR / "email_templates.json"

def get_openai_key():
    return os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")

def load_campaigns() -> Dict:
    """Load email campaigns"""
    if CAMPAIGNS_FILE.exists():
        with open(CAMPAIGNS_FILE, "r") as f:
            return json.load(f)
    return {"campaigns": [], "automations": []}

def save_campaigns(data: Dict):
    """Save campaigns"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(CAMPAIGNS_FILE, "w") as f:
        json.dump(data, f, indent=2)

def load_subscribers() -> Dict:
    """Load email subscribers"""
    if SUBSCRIBERS_FILE.exists():
        with open(SUBSCRIBERS_FILE, "r") as f:
            return json.load(f)
    return {"subscribers": [], "segments": []}

def save_subscribers(data: Dict):
    """Save subscribers"""
    with open(SUBSCRIBERS_FILE, "w") as f:
        json.dump(data, f, indent=2)

def load_templates() -> List[Dict]:
    """Load email templates"""
    if TEMPLATES_FILE.exists():
        with open(TEMPLATES_FILE, "r") as f:
            return json.load(f)
    
    # Default templates
    default_templates = [
        {
            "id": "welcome",
            "name": "Welcome Series",
            "subject": "Welcome to GetPawsy! 🐾",
            "type": "automation"
        },
        {
            "id": "newsletter",
            "name": "Monthly Newsletter",
            "subject": "What's New at GetPawsy 📰",
            "type": "campaign"
        },
        {
            "id": "flash_sale",
            "name": "Flash Sale",
            "subject": "⚡ Flash Sale - 24 Hours Only!",
            "type": "campaign"
        },
        {
            "id": "restock",
            "name": "Back in Stock",
            "subject": "It's Back! 🎉",
            "type": "automation"
        }
    ]
    save_templates(default_templates)
    return default_templates

def save_templates(templates: List[Dict]):
    """Save templates"""
    with open(TEMPLATES_FILE, "w") as f:
        json.dump(templates, f, indent=2)

def subscribe(email: str, name: str = "", pet_type: str = None, source: str = "website") -> Dict:
    """Add email subscriber"""
    data = load_subscribers()
    
    # Check if already subscribed
    existing = next((s for s in data["subscribers"] if s["email"] == email), None)
    if existing:
        if existing.get("status") == "unsubscribed":
            existing["status"] = "active"
            existing["resubscribed_at"] = datetime.now().isoformat()
            save_subscribers(data)
            return {"success": True, "resubscribed": True}
        return {"success": False, "error": "Already subscribed"}
    
    subscriber = {
        "id": f"sub_{int(datetime.now().timestamp())}",
        "email": email,
        "name": name,
        "pet_type": pet_type,
        "source": source,
        "status": "active",
        "tags": [],
        "subscribed_at": datetime.now().isoformat(),
        "opens": 0,
        "clicks": 0
    }
    
    data["subscribers"].append(subscriber)
    save_subscribers(data)
    
    return {"success": True, "subscriber": subscriber}

def unsubscribe(email: str) -> Dict:
    """Unsubscribe email"""
    data = load_subscribers()
    
    for sub in data["subscribers"]:
        if sub["email"] == email:
            sub["status"] = "unsubscribed"
            sub["unsubscribed_at"] = datetime.now().isoformat()
            save_subscribers(data)
            return {"success": True}
    
    return {"success": False, "error": "Subscriber not found"}

def add_tag(email: str, tag: str) -> Dict:
    """Add tag to subscriber"""
    data = load_subscribers()
    
    for sub in data["subscribers"]:
        if sub["email"] == email:
            if tag not in sub.get("tags", []):
                sub["tags"] = sub.get("tags", []) + [tag]
                save_subscribers(data)
            return {"success": True}
    
    return {"success": False, "error": "Subscriber not found"}

def get_segment(segment_rules: Dict) -> List[Dict]:
    """Get subscribers matching segment rules"""
    data = load_subscribers()
    subscribers = [s for s in data["subscribers"] if s.get("status") == "active"]
    
    # Filter by pet type
    if segment_rules.get("pet_type"):
        subscribers = [s for s in subscribers if s.get("pet_type") == segment_rules["pet_type"]]
    
    # Filter by tags
    if segment_rules.get("has_tag"):
        subscribers = [s for s in subscribers if segment_rules["has_tag"] in s.get("tags", [])]
    
    # Filter by engagement
    if segment_rules.get("min_opens"):
        subscribers = [s for s in subscribers if s.get("opens", 0) >= segment_rules["min_opens"]]
    
    return subscribers

def generate_ai_subject(topic: str, style: str = "engaging") -> str:
    """Generate email subject line using AI"""
    api_key = get_openai_key()
    if not api_key:
        return f"🐾 {topic} - GetPawsy"
    
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
                        "content": f"You are an email marketing expert for GetPawsy, a pet store. Generate a {style} email subject line. Use emojis. Keep it under 50 characters. Return ONLY the subject line, nothing else."
                    },
                    {
                        "role": "user",
                        "content": f"Topic: {topic}"
                    }
                ],
                "max_tokens": 60,
                "temperature": 0.8
            },
            timeout=10
        )
        
        if response.status_code == 200:
            return response.json()["choices"][0]["message"]["content"].strip()
    except:
        pass
    
    return f"🐾 {topic} - GetPawsy"

def generate_ai_email_content(subject: str, type: str = "promotional", products: List[Dict] = None) -> str:
    """Generate email content using AI"""
    api_key = get_openai_key()
    
    products_context = ""
    if products:
        products_context = "\nFeatured products:\n" + "\n".join([
            f"- {p.get('name')}: ${p.get('price')} - {p.get('description', '')[:100]}"
            for p in products[:5]
        ])
    
    if not api_key:
        return get_fallback_template(subject, products)
    
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
                        "content": f"""You are an email marketing expert for GetPawsy, a pet store selling dog and cat products.
Generate {type} email content in HTML format. Be warm, friendly, and use emojis.
Include a compelling call-to-action button.
{products_context}
Return only the HTML body content (no <html> or <body> tags)."""
                    },
                    {
                        "role": "user",
                        "content": f"Create email content for: {subject}"
                    }
                ],
                "max_tokens": 1000,
                "temperature": 0.7
            },
            timeout=30
        )
        
        if response.status_code == 200:
            return response.json()["choices"][0]["message"]["content"]
    except:
        pass
    
    return get_fallback_template(subject, products)

def get_fallback_template(subject: str, products: List[Dict] = None) -> str:
    """Fallback email template"""
    products_html = ""
    if products:
        for p in products[:3]:
            products_html += f"""
            <div style="display: inline-block; width: 30%; margin: 1%; text-align: center; vertical-align: top;">
                <img src="{p.get('image', '')}" width="150" style="border-radius: 8px;">
                <h4>{p.get('name', 'Product')}</h4>
                <p style="color: #ff6b35; font-weight: bold;">${p.get('price', 0):.2f}</p>
            </div>
            """
    
    return f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 30px; text-align: center; border-radius: 16px 16px 0 0;">
            <h1 style="color: white; margin: 0;">🐾 GetPawsy</h1>
        </div>
        
        <div style="padding: 30px; background: white;">
            <h2 style="color: #333;">{subject}</h2>
            <p style="color: #666; line-height: 1.6;">
                Hey there, pet lover! We have exciting news to share with you.
                Check out our latest products and deals!
            </p>
            
            {products_html}
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="https://getpawsy.pet" style="background: linear-gradient(135deg, #ff6b35, #f7931e); color: white; padding: 15px 40px; border-radius: 30px; text-decoration: none; font-weight: bold;">
                    Shop Now →
                </a>
            </div>
        </div>
        
        <div style="background: #f9f9f9; padding: 20px; text-align: center; border-radius: 0 0 16px 16px;">
            <p style="color: #999; font-size: 12px;">© 2025 GetPawsy | Made with ❤️ for pet lovers</p>
        </div>
    </div>
    """

def create_campaign(name: str, subject: str, content: str, segment: Dict = None, scheduled_for: str = None) -> Dict:
    """Create an email campaign"""
    data = load_campaigns()
    
    campaign = {
        "id": f"camp_{int(datetime.now().timestamp())}",
        "name": name,
        "subject": subject,
        "content": content,
        "segment": segment or {},
        "status": "draft",
        "created_at": datetime.now().isoformat(),
        "scheduled_for": scheduled_for,
        "sent_at": None,
        "stats": {
            "sent": 0,
            "delivered": 0,
            "opened": 0,
            "clicked": 0,
            "unsubscribed": 0
        }
    }
    
    data["campaigns"].append(campaign)
    save_campaigns(data)
    
    return {"success": True, "campaign": campaign}

def send_campaign(campaign_id: str) -> Dict:
    """Send an email campaign"""
    data = load_campaigns()
    campaign = next((c for c in data["campaigns"] if c["id"] == campaign_id), None)
    
    if not campaign:
        return {"success": False, "error": "Campaign not found"}
    
    if campaign.get("status") == "sent":
        return {"success": False, "error": "Campaign already sent"}
    
    # Get subscribers
    subscribers = get_segment(campaign.get("segment", {}))
    
    sent_count = 0
    for sub in subscribers:
        try:
            requests.post(
                "http://localhost:5000/api/email/send",
                json={
                    "to": sub["email"],
                    "subject": campaign["subject"],
                    "html": wrap_email_html(campaign["content"])
                },
                timeout=5
            )
            sent_count += 1
        except:
            continue
    
    # Update campaign
    campaign["status"] = "sent"
    campaign["sent_at"] = datetime.now().isoformat()
    campaign["stats"]["sent"] = sent_count
    save_campaigns(data)
    
    return {"success": True, "sent": sent_count}

def wrap_email_html(content: str) -> str:
    """Wrap content in email template"""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="background: #f5f5f5; padding: 20px; margin: 0;">
        {content}
    </body>
    </html>
    """

def get_campaign_stats() -> Dict:
    """Get overall campaign statistics"""
    data = load_campaigns()
    subs = load_subscribers()
    
    total_campaigns = len(data.get("campaigns", []))
    sent_campaigns = len([c for c in data.get("campaigns", []) if c.get("status") == "sent"])
    
    total_sent = sum(c.get("stats", {}).get("sent", 0) for c in data.get("campaigns", []))
    total_opened = sum(c.get("stats", {}).get("opened", 0) for c in data.get("campaigns", []))
    
    return {
        "total_campaigns": total_campaigns,
        "sent_campaigns": sent_campaigns,
        "total_subscribers": len([s for s in subs.get("subscribers", []) if s.get("status") == "active"]),
        "total_sent": total_sent,
        "total_opened": total_opened,
        "open_rate": (total_opened / total_sent * 100) if total_sent > 0 else 0
    }

if __name__ == "__main__":
    print("=== Email Marketing Engine V5.4 ===")
    print("\nCampaign Stats:")
    print(json.dumps(get_campaign_stats(), indent=2))
    
    print("\nTemplates:")
    print(json.dumps(load_templates(), indent=2))
