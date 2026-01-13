"""
GetPawsy ULTRA V5.6 - AI Returns Assistant Engine
Handles return requests with AI classification, risk scoring, and auto-approval
"""

import json
import os
import random
import string
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent.parent / "data"
RETURNS_FILE = DATA_DIR / "returns.json"
UPLOADS_DIR = Path(__file__).parent.parent.parent / "public" / "returns"

RETURN_REASONS = [
    "defective",
    "wrong_item",
    "not_as_described",
    "changed_mind",
    "too_small",
    "too_large",
    "damaged_in_shipping",
    "quality_issue",
    "pet_doesnt_like",
    "other"
]

AUTO_APPROVE_REASONS = ["defective", "wrong_item", "damaged_in_shipping"]
RISK_THRESHOLDS = {"low": 30, "medium": 60, "high": 100}

def load_returns():
    if RETURNS_FILE.exists():
        with open(RETURNS_FILE, 'r') as f:
            return json.load(f)
    return {"returns": []}

def save_returns(data):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(RETURNS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def generate_return_id():
    chars = string.ascii_uppercase + string.digits
    return "RET-" + ''.join(random.choices(chars, k=8))

def calculate_risk_score(user_id, reason, order_value):
    data = load_returns()
    user_returns = [r for r in data.get("returns", []) if str(r.get("user_id")) == str(user_id)]
    
    base_score = 20
    
    return_count = len(user_returns)
    if return_count >= 5:
        base_score += 30
    elif return_count >= 3:
        base_score += 15
    elif return_count >= 1:
        base_score += 5
    
    if reason in ["changed_mind", "pet_doesnt_like"]:
        base_score += 15
    elif reason == "other":
        base_score += 10
    
    if order_value > 100:
        base_score += 10
    elif order_value > 50:
        base_score += 5
    
    recent_returns = sum(1 for r in user_returns 
                         if datetime.fromisoformat(r.get("created_at", "2020-01-01")) > 
                         datetime.now().replace(day=1))
    if recent_returns >= 2:
        base_score += 20
    
    return min(base_score, 100)

def classify_return_reason(description, image_analysis=None):
    description_lower = description.lower()
    
    if any(word in description_lower for word in ["broken", "defective", "doesn't work", "malfunction"]):
        return "defective"
    elif any(word in description_lower for word in ["wrong", "different", "not what i ordered"]):
        return "wrong_item"
    elif any(word in description_lower for word in ["damaged", "crushed", "torn"]):
        return "damaged_in_shipping"
    elif any(word in description_lower for word in ["small", "tiny", "too tight"]):
        return "too_small"
    elif any(word in description_lower for word in ["big", "large", "too loose"]):
        return "too_large"
    elif any(word in description_lower for word in ["quality", "cheap", "poor"]):
        return "quality_issue"
    elif any(word in description_lower for word in ["mind", "changed", "don't want", "don't need"]):
        return "changed_mind"
    elif any(word in description_lower for word in ["pet", "dog", "cat", "doesn't like", "won't use"]):
        return "pet_doesnt_like"
    elif any(word in description_lower for word in ["described", "picture", "looks different"]):
        return "not_as_described"
    
    return "other"

def start_return(user_id, order_id, product_id, reason_description, order_value=0):
    data = load_returns()
    
    return_id = generate_return_id()
    classified_reason = classify_return_reason(reason_description)
    risk_score = calculate_risk_score(user_id, classified_reason, order_value)
    
    auto_approved = False
    status = "pending_review"
    
    if classified_reason in AUTO_APPROVE_REASONS and risk_score < RISK_THRESHOLDS["medium"]:
        auto_approved = True
        status = "approved"
    
    new_return = {
        "return_id": return_id,
        "user_id": str(user_id),
        "order_id": str(order_id),
        "product_id": str(product_id),
        "reason_description": reason_description,
        "classified_reason": classified_reason,
        "risk_score": risk_score,
        "status": status,
        "auto_approved": auto_approved,
        "photos": [],
        "admin_notes": "",
        "refund_amount": 0,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "status_history": [
            {"status": status, "timestamp": datetime.now().isoformat(), "note": "Return initiated" + (" - Auto-approved" if auto_approved else "")}
        ]
    }
    
    data["returns"].append(new_return)
    save_returns(data)
    
    return new_return

def upload_photo(return_id, photo_filename):
    data = load_returns()
    
    for ret in data.get("returns", []):
        if ret.get("return_id") == return_id:
            if "photos" not in ret:
                ret["photos"] = []
            ret["photos"].append({
                "filename": photo_filename,
                "uploaded_at": datetime.now().isoformat()
            })
            ret["updated_at"] = datetime.now().isoformat()
            save_returns(data)
            return {"success": True, "photos": ret["photos"]}
    
    return {"success": False, "error": "Return not found"}

def get_return_status(return_id):
    data = load_returns()
    
    for ret in data.get("returns", []):
        if ret.get("return_id") == return_id:
            return ret
    
    return None

def get_user_returns(user_id):
    data = load_returns()
    return [r for r in data.get("returns", []) if str(r.get("user_id")) == str(user_id)]

def get_all_returns(status_filter=None):
    data = load_returns()
    returns = data.get("returns", [])
    
    if status_filter:
        returns = [r for r in returns if r.get("status") == status_filter]
    
    return sorted(returns, key=lambda x: x.get("created_at", ""), reverse=True)

def admin_decision(return_id, decision, admin_notes="", refund_amount=0):
    data = load_returns()
    
    for ret in data.get("returns", []):
        if ret.get("return_id") == return_id:
            ret["status"] = decision
            ret["admin_notes"] = admin_notes
            ret["refund_amount"] = refund_amount
            ret["updated_at"] = datetime.now().isoformat()
            
            ret["status_history"].append({
                "status": decision,
                "timestamp": datetime.now().isoformat(),
                "note": admin_notes or f"Admin decision: {decision}"
            })
            
            save_returns(data)
            return {"success": True, "return": ret}
    
    return {"success": False, "error": "Return not found"}

def get_return_stats():
    data = load_returns()
    returns = data.get("returns", [])
    
    stats = {
        "total": len(returns),
        "pending": sum(1 for r in returns if r.get("status") == "pending_review"),
        "approved": sum(1 for r in returns if r.get("status") == "approved"),
        "denied": sum(1 for r in returns if r.get("status") == "denied"),
        "completed": sum(1 for r in returns if r.get("status") == "completed"),
        "auto_approved": sum(1 for r in returns if r.get("auto_approved")),
        "average_risk_score": 0,
        "top_reasons": {}
    }
    
    if returns:
        stats["average_risk_score"] = sum(r.get("risk_score", 0) for r in returns) / len(returns)
        
        for r in returns:
            reason = r.get("classified_reason", "other")
            stats["top_reasons"][reason] = stats["top_reasons"].get(reason, 0) + 1
    
    return stats

if __name__ == "__main__":
    print("Returns Engine V1 - GetPawsy ULTRA V5.6")
    print("Testing...")
    
    ret = start_return("user-123", "order-456", "prod-789", "The toy arrived broken and my dog can't play with it", 25.99)
    print(f"Created return: {ret['return_id']}, Status: {ret['status']}, Reason: {ret['classified_reason']}")
