#!/usr/bin/env python3
"""
===========================================================
 GetPawsy ULTRA V2 — CATEGORY ENGINE
 Auto-mapping, category index, and page generation
===========================================================
"""

import os
import re
import json
from pathlib import Path

print("🏷️ Category Engine Loaded")

# Category definitions
CATEGORIES = {
    "dog": {
        "name": "Dogs",
        "slug": "dogs",
        "subcategories": ["toys", "beds", "grooming", "feeding", "training", "harnesses", "accessories"]
    },
    "cat": {
        "name": "Cats",
        "slug": "cats",
        "subcategories": ["toys", "beds", "scratchers", "grooming", "feeding", "accessories"]
    }
}

# Keyword mappings for auto-categorization
KEYWORD_MAP = {
    "dog": ["dog", "puppy", "canine", "pup", "doggy", "hound"],
    "cat": ["cat", "kitten", "kitty", "feline", "meow"],
    "toys": ["toy", "ball", "chew", "plush", "squeaky", "rope", "interactive", "puzzle"],
    "beds": ["bed", "cushion", "pillow", "mat", "sleeping", "cozy", "nest"],
    "grooming": ["brush", "comb", "shampoo", "nail", "clipper", "grooming", "bath", "fur"],
    "feeding": ["bowl", "feeder", "water", "food", "dish", "fountain", "slow"],
    "training": ["training", "leash", "collar", "whistle", "clicker", "treat", "potty"],
    "harnesses": ["harness", "vest", "strap", "walking", "lead"],
    "scratchers": ["scratcher", "scratching", "post", "tree", "climbing"],
    "accessories": ["accessory", "tag", "bandana", "bow", "costume", "clothing", "outfit"]
}


def assign_categories(product):
    """
    Auto-assign categories to a product based on title and tags
    Returns: dict with 'animal' and 'type' keys
    """
    title = (product.get("title") or product.get("productName") or "").lower()
    tags = product.get("tags", [])
    
    if isinstance(tags, str):
        tags = [tags]
    
    combined_text = title + " " + " ".join([str(t).lower() for t in tags])
    
    # Detect animal type
    animal = None
    for animal_type, keywords in [("dog", KEYWORD_MAP["dog"]), ("cat", KEYWORD_MAP["cat"])]:
        for keyword in keywords:
            if keyword in combined_text:
                animal = animal_type
                break
        if animal:
            break
    
    # Default to dog if no animal detected
    if not animal:
        animal = "dog"
    
    # Detect product type
    product_type = None
    type_keywords = ["toys", "beds", "grooming", "feeding", "training", "harnesses", "scratchers", "accessories"]
    
    for ptype in type_keywords:
        for keyword in KEYWORD_MAP.get(ptype, []):
            if keyword in combined_text:
                product_type = ptype
                break
        if product_type:
            break
    
    # Default to accessories if no type detected
    if not product_type:
        product_type = "accessories"
    
    return {
        "animal": animal,
        "type": product_type,
        "category_slug": f"{CATEGORIES[animal]['slug']}/{product_type}",
        "category_name": f"{CATEGORIES[animal]['name']} {product_type.title()}"
    }


def update_categories(products=None):
    """
    Update categories for all products
    If products not provided, loads from data/products.json
    """
    if products is None:
        if os.path.exists("data/products.json"):
            with open("data/products.json") as f:
                products = json.load(f)
        else:
            print("❌ No products found")
            return []
    
    updated = []
    for product in products:
        cats = assign_categories(product)
        product["animal"] = cats["animal"]
        product["product_type"] = cats["type"]
        product["category_slug"] = cats["category_slug"]
        product["category_name"] = cats["category_name"]
        updated.append(product)
    
    # Save updated products
    Path("data").mkdir(exist_ok=True)
    with open("data/products.json", "w") as f:
        json.dump(updated, f, indent=2)
    
    print(f"✔️ Updated categories for {len(updated)} products")
    return updated


def get_category_index():
    """
    Build and return a category index
    Returns: dict with category structure and product counts
    """
    if not os.path.exists("data/products.json"):
        return {"categories": CATEGORIES, "counts": {}}
    
    with open("data/products.json") as f:
        products = json.load(f)
    
    counts = {}
    for product in products:
        slug = product.get("category_slug", "dogs/accessories")
        counts[slug] = counts.get(slug, 0) + 1
    
    index = {
        "categories": CATEGORIES,
        "counts": counts,
        "total_products": len(products)
    }
    
    # Save index
    with open("data/category_index.json", "w") as f:
        json.dump(index, f, indent=2)
    
    return index


def generate_category_pages():
    """
    Generate static category page data
    Creates category_pages.json with page metadata
    """
    index = get_category_index()
    pages = []
    
    for animal_key, animal_data in CATEGORIES.items():
        # Main animal page
        pages.append({
            "slug": animal_data["slug"],
            "title": f"{animal_data['name']} Products",
            "description": f"Shop all {animal_data['name'].lower()} products at GetPawsy",
            "type": "main",
            "count": sum(index["counts"].get(f"{animal_data['slug']}/{sub}", 0) 
                        for sub in animal_data["subcategories"])
        })
        
        # Subcategory pages
        for sub in animal_data["subcategories"]:
            slug = f"{animal_data['slug']}/{sub}"
            pages.append({
                "slug": slug,
                "title": f"{animal_data['name']} {sub.title()}",
                "description": f"Shop {sub} for {animal_data['name'].lower()} at GetPawsy",
                "type": "subcategory",
                "parent": animal_data["slug"],
                "count": index["counts"].get(slug, 0)
            })
    
    # Save pages
    Path("data").mkdir(exist_ok=True)
    with open("data/category_pages.json", "w") as f:
        json.dump(pages, f, indent=2)
    
    print(f"✔️ Generated {len(pages)} category pages")
    return pages


def get_products_by_category(category_slug, limit=50):
    """
    Get products for a specific category
    """
    if not os.path.exists("data/products.json"):
        return []
    
    with open("data/products.json") as f:
        products = json.load(f)
    
    filtered = [p for p in products if p.get("category_slug") == category_slug]
    return filtered[:limit]


# Main execution
if __name__ == "__main__":
    print("\n🏷️ GetPawsy Category Engine\n")
    
    # Update all product categories
    update_categories()
    
    # Build category index
    index = get_category_index()
    print(f"📊 Category Index: {len(index['counts'])} categories")
    
    # Generate category pages
    pages = generate_category_pages()
    
    print("\n✅ engine_categories.py ready.")
