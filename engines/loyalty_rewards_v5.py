#!/usr/bin/env python3
"""
GetPawsy Loyalty Rewards System V5.4
Points-based rewards program for repeat customers
"""

import os
import json
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
LOYALTY_FILE = DATA_DIR / "loyalty_accounts.json"
REWARDS_FILE = DATA_DIR / "rewards_catalog.json"
TRANSACTIONS_FILE = DATA_DIR / "loyalty_transactions.json"

# Loyalty tiers
TIERS = {
    "bronze": {"min_points": 0, "multiplier": 1.0, "perks": ["Birthday bonus", "Member-only sales"]},
    "silver": {"min_points": 500, "multiplier": 1.25, "perks": ["Free shipping over $25", "Early access to sales"]},
    "gold": {"min_points": 1500, "multiplier": 1.5, "perks": ["Free shipping", "Exclusive products", "Priority support"]},
    "platinum": {"min_points": 5000, "multiplier": 2.0, "perks": ["VIP everything", "Personal shopper", "Monthly gift"]}
}

# Points earning rules
POINTS_RULES = {
    "purchase": 1,  # Points per dollar spent
    "review": 50,   # Points for leaving a review
    "referral": 200,  # Points for referring a friend
    "birthday": 100,  # Birthday bonus points
    "signup": 100,    # Welcome bonus
}

def load_loyalty_accounts() -> Dict:
    """Load all loyalty accounts"""
    if LOYALTY_FILE.exists():
        with open(LOYALTY_FILE, "r") as f:
            return json.load(f)
    return {"accounts": {}, "settings": {"enabled": True, "points_per_dollar": 1}}

def save_loyalty_accounts(data: Dict):
    """Save loyalty accounts"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(LOYALTY_FILE, "w") as f:
        json.dump(data, f, indent=2)

def load_rewards_catalog() -> List[Dict]:
    """Load rewards catalog"""
    if REWARDS_FILE.exists():
        with open(REWARDS_FILE, "r") as f:
            return json.load(f)
    # Default rewards
    default_rewards = [
        {"id": "r1", "name": "$5 Off", "points": 500, "type": "discount", "value": 5},
        {"id": "r2", "name": "$10 Off", "points": 900, "type": "discount", "value": 10},
        {"id": "r3", "name": "$25 Off", "points": 2000, "type": "discount", "value": 25},
        {"id": "r4", "name": "Free Shipping", "points": 300, "type": "shipping", "value": 0},
        {"id": "r5", "name": "Mystery Gift", "points": 1500, "type": "gift", "value": "mystery_box"},
        {"id": "r6", "name": "Double Points Day", "points": 750, "type": "multiplier", "value": 2}
    ]
    save_rewards_catalog(default_rewards)
    return default_rewards

def save_rewards_catalog(rewards: List[Dict]):
    """Save rewards catalog"""
    with open(REWARDS_FILE, "w") as f:
        json.dump(rewards, f, indent=2)

def load_transactions() -> List[Dict]:
    """Load loyalty transactions"""
    if TRANSACTIONS_FILE.exists():
        with open(TRANSACTIONS_FILE, "r") as f:
            return json.load(f)
    return []

def save_transactions(transactions: List[Dict]):
    """Save loyalty transactions"""
    with open(TRANSACTIONS_FILE, "w") as f:
        json.dump(transactions, f, indent=2)

def get_tier(points: int) -> str:
    """Determine tier based on lifetime points"""
    current_tier = "bronze"
    for tier, config in TIERS.items():
        if points >= config["min_points"]:
            current_tier = tier
    return current_tier

def get_tier_info(tier: str) -> Dict:
    """Get tier information"""
    return TIERS.get(tier, TIERS["bronze"])

def create_account(user_id: str, email: str, name: str = "") -> Dict:
    """Create a new loyalty account"""
    data = load_loyalty_accounts()
    
    if user_id in data["accounts"]:
        return {"success": False, "error": "Account already exists"}
    
    account = {
        "user_id": user_id,
        "email": email,
        "name": name,
        "points": POINTS_RULES["signup"],  # Welcome bonus
        "lifetime_points": POINTS_RULES["signup"],
        "tier": "bronze",
        "created_at": datetime.now().isoformat(),
        "birthday": None,
        "referral_code": f"PAWSY{user_id[:6].upper()}",
        "referred_by": None,
        "redeemed_rewards": []
    }
    
    data["accounts"][user_id] = account
    save_loyalty_accounts(data)
    
    # Log signup bonus transaction
    log_transaction(user_id, "earn", POINTS_RULES["signup"], "signup_bonus", "Welcome bonus!")
    
    return {"success": True, "account": account}

def get_account(user_id: str) -> Optional[Dict]:
    """Get loyalty account"""
    data = load_loyalty_accounts()
    account = data["accounts"].get(user_id)
    
    if account:
        # Update tier based on lifetime points
        account["tier"] = get_tier(account.get("lifetime_points", 0))
        account["tier_info"] = get_tier_info(account["tier"])
        account["next_tier"] = get_next_tier_info(account.get("lifetime_points", 0))
    
    return account

def get_next_tier_info(points: int) -> Optional[Dict]:
    """Get info about next tier"""
    current = get_tier(points)
    tier_order = ["bronze", "silver", "gold", "platinum"]
    current_idx = tier_order.index(current)
    
    if current_idx < len(tier_order) - 1:
        next_tier = tier_order[current_idx + 1]
        next_config = TIERS[next_tier]
        points_needed = next_config["min_points"] - points
        return {
            "name": next_tier,
            "points_needed": points_needed,
            "perks": next_config["perks"]
        }
    return None

def earn_points(user_id: str, amount: float, reason: str, order_id: str = None) -> Dict:
    """Earn points from purchase or action"""
    data = load_loyalty_accounts()
    account = data["accounts"].get(user_id)
    
    if not account:
        return {"success": False, "error": "Account not found"}
    
    # Calculate points with tier multiplier
    tier = get_tier(account.get("lifetime_points", 0))
    multiplier = TIERS[tier]["multiplier"]
    
    base_points = int(amount * POINTS_RULES.get(reason, 1))
    bonus_points = int(base_points * (multiplier - 1))
    total_points = base_points + bonus_points
    
    account["points"] = account.get("points", 0) + total_points
    account["lifetime_points"] = account.get("lifetime_points", 0) + total_points
    account["tier"] = get_tier(account["lifetime_points"])
    
    data["accounts"][user_id] = account
    save_loyalty_accounts(data)
    
    # Log transaction
    log_transaction(user_id, "earn", total_points, reason, f"Order: {order_id}" if order_id else "", order_id)
    
    return {
        "success": True,
        "points_earned": total_points,
        "base_points": base_points,
        "bonus_points": bonus_points,
        "new_balance": account["points"],
        "tier": account["tier"]
    }

def redeem_reward(user_id: str, reward_id: str) -> Dict:
    """Redeem a reward"""
    data = load_loyalty_accounts()
    account = data["accounts"].get(user_id)
    
    if not account:
        return {"success": False, "error": "Account not found"}
    
    rewards = load_rewards_catalog()
    reward = next((r for r in rewards if r["id"] == reward_id), None)
    
    if not reward:
        return {"success": False, "error": "Reward not found"}
    
    if account["points"] < reward["points"]:
        return {"success": False, "error": "Not enough points", "points_needed": reward["points"] - account["points"]}
    
    # Deduct points
    account["points"] -= reward["points"]
    
    # Generate reward code
    reward_code = f"REWARD_{reward_id}_{user_id[:6]}_{int(datetime.now().timestamp())}"
    
    redemption = {
        "reward_id": reward_id,
        "reward_name": reward["name"],
        "points_spent": reward["points"],
        "code": reward_code,
        "redeemed_at": datetime.now().isoformat(),
        "used": False
    }
    
    account["redeemed_rewards"].append(redemption)
    data["accounts"][user_id] = account
    save_loyalty_accounts(data)
    
    # Log transaction
    log_transaction(user_id, "redeem", -reward["points"], f"reward_{reward_id}", reward["name"])
    
    return {
        "success": True,
        "reward": reward,
        "code": reward_code,
        "new_balance": account["points"]
    }

def log_transaction(user_id: str, type: str, points: int, reason: str, details: str = "", order_id: str = None):
    """Log a loyalty transaction"""
    transactions = load_transactions()
    
    transaction = {
        "id": f"tx_{int(datetime.now().timestamp())}_{user_id[:6]}",
        "user_id": user_id,
        "type": type,  # earn, redeem, expire, adjust
        "points": points,
        "reason": reason,
        "details": details,
        "order_id": order_id,
        "created_at": datetime.now().isoformat()
    }
    
    transactions.append(transaction)
    save_transactions(transactions)

def get_transactions(user_id: str, limit: int = 20) -> List[Dict]:
    """Get user's transaction history"""
    transactions = load_transactions()
    user_tx = [t for t in transactions if t.get("user_id") == user_id]
    return sorted(user_tx, key=lambda x: x["created_at"], reverse=True)[:limit]

def apply_referral(user_id: str, referral_code: str) -> Dict:
    """Apply a referral code"""
    data = load_loyalty_accounts()
    account = data["accounts"].get(user_id)
    
    if not account:
        return {"success": False, "error": "Account not found"}
    
    if account.get("referred_by"):
        return {"success": False, "error": "Referral already applied"}
    
    # Find referrer
    referrer = None
    for uid, acc in data["accounts"].items():
        if acc.get("referral_code") == referral_code and uid != user_id:
            referrer = acc
            referrer_id = uid
            break
    
    if not referrer:
        return {"success": False, "error": "Invalid referral code"}
    
    # Give points to both parties
    account["referred_by"] = referral_code
    account["points"] += POINTS_RULES["referral"]
    account["lifetime_points"] += POINTS_RULES["referral"]
    
    referrer["points"] += POINTS_RULES["referral"]
    referrer["lifetime_points"] += POINTS_RULES["referral"]
    
    data["accounts"][user_id] = account
    data["accounts"][referrer_id] = referrer
    save_loyalty_accounts(data)
    
    log_transaction(user_id, "earn", POINTS_RULES["referral"], "referral_bonus", f"Used code: {referral_code}")
    log_transaction(referrer_id, "earn", POINTS_RULES["referral"], "referral_reward", f"Referred: {account['email']}")
    
    return {
        "success": True,
        "points_earned": POINTS_RULES["referral"],
        "new_balance": account["points"]
    }

def get_leaderboard(limit: int = 10) -> List[Dict]:
    """Get top loyalty members"""
    data = load_loyalty_accounts()
    accounts = list(data["accounts"].values())
    
    leaderboard = sorted(accounts, key=lambda x: x.get("lifetime_points", 0), reverse=True)[:limit]
    
    return [{
        "name": a.get("name", "Member")[:15] + "..." if len(a.get("name", "")) > 15 else a.get("name", "Member"),
        "tier": get_tier(a.get("lifetime_points", 0)),
        "lifetime_points": a.get("lifetime_points", 0)
    } for a in leaderboard]

def get_program_stats() -> Dict:
    """Get loyalty program statistics"""
    data = load_loyalty_accounts()
    accounts = list(data["accounts"].values())
    
    total_members = len(accounts)
    total_points_earned = sum(a.get("lifetime_points", 0) for a in accounts)
    total_points_available = sum(a.get("points", 0) for a in accounts)
    
    tier_distribution = {}
    for tier in TIERS.keys():
        tier_distribution[tier] = sum(1 for a in accounts if get_tier(a.get("lifetime_points", 0)) == tier)
    
    return {
        "total_members": total_members,
        "total_points_earned": total_points_earned,
        "total_points_available": total_points_available,
        "tier_distribution": tier_distribution,
        "tiers": TIERS
    }

if __name__ == "__main__":
    print("=== Loyalty Rewards System V5.4 ===")
    print("\nProgram Stats:")
    print(json.dumps(get_program_stats(), indent=2))
    
    print("\nRewards Catalog:")
    print(json.dumps(load_rewards_catalog(), indent=2))
    
    print("\nTiers:")
    print(json.dumps(TIERS, indent=2))
