#!/usr/bin/env python3
"""
===========================================================
 GetPawsy ULTRA V2 — HOMEPAGE ENGINE
 AI-powered featured products, hero slots, trending engine
===========================================================
"""

import os
import json
import random
from pathlib import Path
from datetime import datetime

print("🏠 Homepage Engine Loaded")


def load_products():
    """Load products from data store"""
    if os.path.exists("data/products.json"):
        with open("data/products.json") as f:
            return json.load(f)
    return []


def get_featured_products(products, count=8):
    """
    AI-powered featured product selector
    Selects products based on: images, price, variety
    """
    if not products:
        return []
    
    # Filter products with images
    with_images = [p for p in products if p.get("images") and len(p["images"]) > 0]
    
    if not with_images:
        return products[:count]
    
    # Score products
    scored = []
    for p in with_images:
        score = 0
        
        # More images = higher score
        score += min(len(p.get("images", [])), 3) * 10
        
        # Mid-range price preferred
        price = p.get("price", 0)
        if 10 <= price <= 50:
            score += 20
        elif 5 <= price <= 100:
            score += 10
        
        # Has bullets/tags = higher score
        score += min(len(p.get("bullets", [])), 3) * 5
        score += min(len(p.get("tags", [])), 5) * 3
        
        scored.append((p, score))
    
    # Sort by score and add variety
    scored.sort(key=lambda x: x[1], reverse=True)
    
    # Take top scorers with variety
    featured = []
    animals_used = set()
    types_used = set()
    
    for p, score in scored:
        animal = p.get("animal", "dog")
        ptype = p.get("product_type", "accessories")
        
        # Add variety
        if len(featured) < count // 2:
            featured.append(p)
            animals_used.add(animal)
            types_used.add(ptype)
        elif animal not in animals_used or ptype not in types_used:
            featured.append(p)
            animals_used.add(animal)
            types_used.add(ptype)
        elif len(featured) < count:
            featured.append(p)
        
        if len(featured) >= count:
            break
    
    return featured


def get_hero_products(products, count=3):
    """
    Hero slot recommender
    Selects best products for hero banner display
    """
    if not products:
        return []
    
    # Filter for products with multiple images
    hero_worthy = [p for p in products 
                   if p.get("images") and len(p["images"]) >= 2]
    
    if not hero_worthy:
        hero_worthy = [p for p in products if p.get("images")]
    
    if not hero_worthy:
        return products[:count]
    
    # Score for hero suitability
    scored = []
    for p in hero_worthy:
        score = 0
        
        # Image count
        score += len(p.get("images", [])) * 15
        
        # Title length (not too short, not too long)
        title_len = len(p.get("title", ""))
        if 20 <= title_len <= 60:
            score += 20
        
        # Has good SEO
        if p.get("seo_description"):
            score += 10
        
        scored.append((p, score))
    
    scored.sort(key=lambda x: x[1], reverse=True)
    return [p for p, s in scored[:count]]


def get_trending_products(products, count=6):
    """
    Trending engine - simulates trending based on variety and recency
    """
    if not products:
        return []
    
    # Shuffle with seed based on date (changes daily)
    today = datetime.now().strftime("%Y%m%d")
    random.seed(int(today))
    
    with_images = [p for p in products if p.get("images")]
    random.shuffle(with_images)
    
    # Ensure variety
    trending = []
    seen_types = set()
    
    for p in with_images:
        ptype = p.get("product_type", "accessories")
        if ptype not in seen_types or len(trending) >= count // 2:
            trending.append(p)
            seen_types.add(ptype)
        
        if len(trending) >= count:
            break
    
    return trending


def get_new_arrivals(products, count=4):
    """Get newest products (assumes last in list are newest)"""
    if not products:
        return []
    
    with_images = [p for p in products if p.get("images")]
    return with_images[-count:][::-1]  # Reverse to show newest first


def build_homepage_json():
    """
    Build complete homepage JSON with all sections
    """
    products = load_products()
    
    homepage = {
        "generated_at": datetime.now().isoformat(),
        "hero": {
            "products": get_hero_products(products, 3),
            "title": "Premium Pet Products",
            "subtitle": "Shop the best for your furry friends"
        },
        "featured": {
            "title": "Featured Products",
            "products": get_featured_products(products, 8)
        },
        "trending": {
            "title": "Trending Now",
            "products": get_trending_products(products, 6)
        },
        "new_arrivals": {
            "title": "New Arrivals",
            "products": get_new_arrivals(products, 4)
        },
        "categories": {
            "dogs": {
                "title": "Shop for Dogs",
                "image": "/images/dogs-category.jpg",
                "count": len([p for p in products if p.get("animal") == "dog"])
            },
            "cats": {
                "title": "Shop for Cats",
                "image": "/images/cats-category.jpg",
                "count": len([p for p in products if p.get("animal") == "cat"])
            }
        },
        "stats": {
            "total_products": len(products),
            "dog_products": len([p for p in products if p.get("animal") == "dog"]),
            "cat_products": len([p for p in products if p.get("animal") == "cat"])
        }
    }
    
    # Save homepage JSON
    Path("data").mkdir(exist_ok=True)
    with open("data/homepage.json", "w") as f:
        json.dump(homepage, f, indent=2)
    
    print(f"✔️ Homepage JSON built with {len(products)} products")
    return homepage


def refresh_homepage():
    """
    Refresh homepage data
    Called periodically to update featured/trending
    """
    print("🔄 Refreshing homepage...")
    homepage = build_homepage_json()
    print(f"✔️ Homepage refreshed at {homepage['generated_at']}")
    return homepage


# Main execution
if __name__ == "__main__":
    print("\n🏠 GetPawsy Homepage Engine\n")
    
    homepage = build_homepage_json()
    
    print(f"\n📊 Homepage Stats:")
    print(f"   Hero products: {len(homepage['hero']['products'])}")
    print(f"   Featured: {len(homepage['featured']['products'])}")
    print(f"   Trending: {len(homepage['trending']['products'])}")
    print(f"   New arrivals: {len(homepage['new_arrivals']['products'])}")
    
    print("\n✅ engine_homepage.py ready.")
