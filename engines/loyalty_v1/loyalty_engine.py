"""
GetPawsy ULTRA V5.6 - Loyalty Program Engine
Tracks customer loyalty: points, levels, rewards, engagement
"""

import json
import os
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent.parent / "data"
LOYALTY_FILE = DATA_DIR / "loyalty_accounts.json"
RULES_FILE = Path(__file__).parent / "loyalty_rules.json"

def load_rules():
    if RULES_FILE.exists():
        with open(RULES_FILE, 'r') as f:
            return json.load(f)
    return get_default_rules()

def get_default_rules():
    return {
        "points_per_dollar": 10,
        "levels": {
            "Bronze": {"min_points": 0, "discount": 0, "free_shipping_threshold": 50},
            "Silver": {"min_points": 500, "discount": 5, "free_shipping_threshold": 35},
            "Gold": {"min_points": 2000, "discount": 10, "free_shipping_threshold": 25},
            "Pawsy Elite": {"min_points": 5000, "discount": 15, "free_shipping_threshold": 0}
        },
        "rewards": [
            {"id": "free_shipping", "name": "Free Shipping", "points_cost": 100, "type": "free_shipping"},
            {"id": "discount_5", "name": "$5 Off", "points_cost": 250, "type": "discount_code", "value": 5},
            {"id": "discount_10", "name": "$10 Off", "points_cost": 450, "type": "discount_code", "value": 10},
            {"id": "bonus_points", "name": "50 Bonus Points", "points_cost": 200, "type": "bonus_points", "value": 50},
            {"id": "discount_20", "name": "$20 Off", "points_cost": 800, "type": "discount_code", "value": 20}
        ],
        "bonus_actions": {
            "first_purchase": 100,
            "review": 25,
            "referral": 200,
            "birthday": 50,
            "newsletter_signup": 25
        }
    }

def load_accounts():
    if LOYALTY_FILE.exists():
        with open(LOYALTY_FILE, 'r') as f:
            return json.load(f)
    return {"accounts": []}

def save_accounts(data):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(LOYALTY_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def get_level(points):
    rules = load_rules()
    levels = rules.get("levels", {})
    current_level = "Bronze"
    for level_name, level_data in sorted(levels.items(), key=lambda x: x[1]["min_points"]):
        if points >= level_data["min_points"]:
            current_level = level_name
    return current_level

def get_level_benefits(level_name):
    rules = load_rules()
    levels = rules.get("levels", {})
    return levels.get(level_name, levels.get("Bronze", {}))

def get_account(user_id):
    data = load_accounts()
    for acc in data.get("accounts", []):
        if str(acc.get("user_id")) == str(user_id):
            acc["level"] = get_level(acc.get("points", 0))
            acc["benefits"] = get_level_benefits(acc["level"])
            return acc
    return None

def create_account(user_id, email=None, name=None):
    data = load_accounts()
    existing = get_account(user_id)
    if existing:
        return existing
    
    new_account = {
        "user_id": str(user_id),
        "email": email or "",
        "name": name or "",
        "points": 0,
        "lifetime_points": 0,
        "total_spent": 0,
        "order_count": 0,
        "return_count": 0,
        "engagement_score": 0,
        "level": "Bronze",
        "created_at": datetime.now().isoformat(),
        "transactions": [],
        "redeemed_rewards": []
    }
    data["accounts"].append(new_account)
    save_accounts(data)
    new_account["benefits"] = get_level_benefits("Bronze")
    return new_account

def earn_points(user_id, points, reason, order_amount=0):
    data = load_accounts()
    for acc in data.get("accounts", []):
        if str(acc.get("user_id")) == str(user_id):
            acc["points"] = acc.get("points", 0) + points
            acc["lifetime_points"] = acc.get("lifetime_points", 0) + points
            if order_amount > 0:
                acc["total_spent"] = acc.get("total_spent", 0) + order_amount
                acc["order_count"] = acc.get("order_count", 0) + 1
            
            transaction = {
                "type": "earn",
                "points": points,
                "reason": reason,
                "order_amount": order_amount,
                "timestamp": datetime.now().isoformat()
            }
            if "transactions" not in acc:
                acc["transactions"] = []
            acc["transactions"].append(transaction)
            
            acc["level"] = get_level(acc["points"])
            save_accounts(data)
            return acc
    return None

def redeem_reward(user_id, reward_id):
    rules = load_rules()
    rewards = rules.get("rewards", [])
    
    reward = None
    for r in rewards:
        if r["id"] == reward_id:
            reward = r
            break
    
    if not reward:
        return {"success": False, "error": "Reward not found"}
    
    data = load_accounts()
    for acc in data.get("accounts", []):
        if str(acc.get("user_id")) == str(user_id):
            if acc.get("points", 0) < reward["points_cost"]:
                return {"success": False, "error": "Not enough points"}
            
            acc["points"] -= reward["points_cost"]
            
            redemption = {
                "reward_id": reward_id,
                "reward_name": reward["name"],
                "points_spent": reward["points_cost"],
                "reward_type": reward["type"],
                "reward_value": reward.get("value"),
                "timestamp": datetime.now().isoformat(),
                "code": f"PAWSY-{reward_id.upper()}-{user_id[-4:] if len(str(user_id)) >= 4 else user_id}"
            }
            
            if "redeemed_rewards" not in acc:
                acc["redeemed_rewards"] = []
            acc["redeemed_rewards"].append(redemption)
            
            transaction = {
                "type": "redeem",
                "points": -reward["points_cost"],
                "reason": f"Redeemed: {reward['name']}",
                "timestamp": datetime.now().isoformat()
            }
            if "transactions" not in acc:
                acc["transactions"] = []
            acc["transactions"].append(transaction)
            
            save_accounts(data)
            return {"success": True, "redemption": redemption, "remaining_points": acc["points"]}
    
    return {"success": False, "error": "Account not found"}

def get_available_rewards(user_id):
    rules = load_rules()
    account = get_account(user_id)
    
    if not account:
        return []
    
    current_points = account.get("points", 0)
    rewards = []
    
    for reward in rules.get("rewards", []):
        rewards.append({
            **reward,
            "affordable": current_points >= reward["points_cost"],
            "points_needed": max(0, reward["points_cost"] - current_points)
        })
    
    return rewards

def get_all_accounts():
    data = load_accounts()
    accounts = []
    for acc in data.get("accounts", []):
        acc["level"] = get_level(acc.get("points", 0))
        accounts.append(acc)
    return accounts

def calculate_points_from_order(order_total):
    rules = load_rules()
    points_per_dollar = rules.get("points_per_dollar", 10)
    return int(order_total * points_per_dollar)

def get_next_level_info(user_id):
    account = get_account(user_id)
    if not account:
        return None
    
    rules = load_rules()
    current_level = account["level"]
    current_points = account.get("points", 0)
    
    levels_sorted = sorted(rules["levels"].items(), key=lambda x: x[1]["min_points"])
    
    for i, (level_name, level_data) in enumerate(levels_sorted):
        if level_name == current_level:
            if i + 1 < len(levels_sorted):
                next_level_name, next_level_data = levels_sorted[i + 1]
                points_needed = next_level_data["min_points"] - current_points
                return {
                    "next_level": next_level_name,
                    "points_needed": max(0, points_needed),
                    "next_level_benefits": next_level_data
                }
            return {"next_level": None, "message": "You've reached the highest level!"}
    
    return None

if __name__ == "__main__":
    print("Loyalty Engine V1 - GetPawsy ULTRA V5.6")
    print("Testing...")
    
    acc = create_account("test-user-1", "test@example.com", "Test User")
    print(f"Created account: {acc}")
    
    earn_points("test-user-1", 500, "Welcome bonus")
    acc = get_account("test-user-1")
    print(f"After earning 500 points: {acc['points']} points, Level: {acc['level']}")
