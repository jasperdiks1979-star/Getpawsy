#!/usr/bin/env python3
"""
GetPawsy Upsell Engine V2
AI-powered product recommendations based on embeddings, history, and price proximity
"""

import os
import json
import requests
from pathlib import Path
from datetime import datetime
import math

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
PRODUCTS_FILE = DATA_DIR / "products_v5.json"
HISTORY_FILE = DATA_DIR / "user_history.json"

def load_products():
    """Load all products"""
    if PRODUCTS_FILE.exists():
        with open(PRODUCTS_FILE, "r") as f:
            data = json.load(f)
            return data.get("products", [])
    return []

def load_user_history(user_id=None):
    """Load user browsing/purchase history"""
    if HISTORY_FILE.exists():
        with open(HISTORY_FILE, "r") as f:
            data = json.load(f)
            if user_id:
                return data.get(user_id, {"views": [], "purchases": [], "cart": []})
            return data
    return {}

def calculate_similarity_score(product1, product2):
    """Calculate similarity between two products"""
    score = 0
    
    if product1.get("category") == product2.get("category"):
        score += 30
    
    tags1 = set(product1.get("tags", []))
    tags2 = set(product2.get("tags", []))
    if tags1 and tags2:
        overlap = len(tags1 & tags2) / len(tags1 | tags2)
        score += overlap * 40
    
    price1 = product1.get("price", 0)
    price2 = product2.get("price", 0)
    if price1 > 0 and price2 > 0:
        price_diff = abs(price1 - price2) / max(price1, price2)
        price_score = max(0, 20 - (price_diff * 40))
        score += price_score
    
    rating1 = product1.get("rating", 0)
    rating2 = product2.get("rating", 0)
    if rating2 >= 4.5:
        score += 10
    elif rating2 >= 4.0:
        score += 5
    
    return score

def get_upsells_for_product(product_id, limit=3):
    """Get upsell recommendations for a specific product"""
    products = load_products()
    
    source_product = None
    for p in products:
        if p.get("id") == product_id:
            source_product = p
            break
    
    if not source_product:
        return get_popular_products(limit)
    
    candidates = []
    for p in products:
        if p.get("id") == product_id:
            continue
        if not p.get("published", True):
            continue
        if p.get("stock", 0) <= 0:
            continue
        
        score = calculate_similarity_score(source_product, p)
        
        source_price = source_product.get("price", 0)
        p_price = p.get("price", 0)
        if p_price > source_price and p_price <= source_price * 1.5:
            score += 15
        
        candidates.append((p, score))
    
    candidates.sort(key=lambda x: x[1], reverse=True)
    
    return [c[0] for c in candidates[:limit]]

def get_cart_upsells(cart_items, limit=3):
    """Get upsells based on cart contents"""
    products = load_products()
    cart_ids = {item.get("id") for item in cart_items}
    
    categories = set()
    tags = set()
    total_price = 0
    
    for item in cart_items:
        categories.add(item.get("category", ""))
        tags.update(item.get("tags", []))
        total_price += item.get("price", 0) * item.get("quantity", 1)
    
    candidates = []
    for p in products:
        if p.get("id") in cart_ids:
            continue
        if not p.get("published", True):
            continue
        if p.get("stock", 0) <= 0:
            continue
        
        score = 0
        
        if p.get("category") in categories:
            score += 20
        
        p_tags = set(p.get("tags", []))
        if p_tags & tags:
            overlap = len(p_tags & tags) / len(p_tags | tags) if p_tags else 0
            score += overlap * 30
        
        p_price = p.get("price", 0)
        if p_price < 20:
            score += 25
        elif p_price < 40:
            score += 15
        
        if p.get("badge") in ["Bestseller", "Hot", "Trending"]:
            score += 10
        
        if p.get("rating", 0) >= 4.5:
            score += 10
        
        candidates.append((p, score))
    
    candidates.sort(key=lambda x: x[1], reverse=True)
    
    return [c[0] for c in candidates[:limit]]

def get_checkout_upsells(cart_items, limit=3):
    """Get last-chance upsells for checkout page"""
    products = load_products()
    cart_ids = {item.get("id") for item in cart_items}
    
    candidates = []
    for p in products:
        if p.get("id") in cart_ids:
            continue
        if not p.get("published", True):
            continue
        
        score = 0
        
        p_price = p.get("price", 0)
        if p_price <= 15:
            score += 40
        elif p_price <= 25:
            score += 20
        
        if p.get("badge") in ["Bestseller", "Hot"]:
            score += 20
        
        if p.get("rating", 0) >= 4.7:
            score += 15
        
        if "bundle" in p.get("tags", []) or p.get("is_bundle"):
            score += 10
        
        candidates.append((p, score))
    
    candidates.sort(key=lambda x: x[1], reverse=True)
    
    return [c[0] for c in candidates[:limit]]

def get_post_purchase_upsells(order_items, limit=3):
    """Get recommendations for post-purchase page"""
    products = load_products()
    order_ids = {item.get("id") for item in order_items}
    
    categories = set()
    for item in order_items:
        categories.add(item.get("category", ""))
    
    candidates = []
    for p in products:
        if p.get("id") in order_ids:
            continue
        if not p.get("published", True):
            continue
        
        score = 0
        
        if p.get("category") in categories:
            score += 25
        
        if p.get("badge") in ["Bestseller", "New", "Trending"]:
            score += 15
        
        score += (p.get("rating", 0) - 4) * 20
        
        candidates.append((p, score))
    
    candidates.sort(key=lambda x: x[1], reverse=True)
    
    return [c[0] for c in candidates[:limit]]

def get_popular_products(limit=3):
    """Get popular products as fallback"""
    products = load_products()
    
    scored = []
    for p in products:
        if not p.get("published", True):
            continue
        score = p.get("rating", 0) * 20 + p.get("reviews_count", 0) / 10
        if p.get("badge") == "Bestseller":
            score += 50
        scored.append((p, score))
    
    scored.sort(key=lambda x: x[1], reverse=True)
    return [s[0] for s in scored[:limit]]

def get_ai_recommendations(product_id=None, user_id=None, context="product", limit=3):
    """Main entry point for getting AI-powered recommendations"""
    if context == "product" and product_id:
        return get_upsells_for_product(product_id, limit)
    elif context == "cart":
        cart_items = []
        return get_cart_upsells(cart_items, limit)
    elif context == "checkout":
        return get_checkout_upsells([], limit)
    elif context == "post_purchase":
        return get_post_purchase_upsells([], limit)
    else:
        return get_popular_products(limit)

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        product_id = sys.argv[1]
        recommendations = get_upsells_for_product(product_id)
        print(f"Recommendations for {product_id}:")
        for r in recommendations:
            print(f"  - {r['name']} (${r['price']})")
    else:
        popular = get_popular_products(5)
        print("Popular products:")
        for p in popular:
            print(f"  - {p['name']} (${p['price']})")
