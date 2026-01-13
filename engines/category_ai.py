#!/usr/bin/env python3
"""
GetPawsy AI Category Generator V5.3
Generate category pages with AI-powered content
"""

import os
import json
import requests
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
CATEGORIES_FILE = DATA_DIR / "categories.json"
PRODUCTS_FILE = DATA_DIR / "products_v5.json"

def get_openai_key():
    return os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")

def load_products():
    """Load all products"""
    if PRODUCTS_FILE.exists():
        with open(PRODUCTS_FILE, "r") as f:
            data = json.load(f)
            return data.get("products", [])
    return []

def load_categories():
    """Load existing categories"""
    if CATEGORIES_FILE.exists():
        with open(CATEGORIES_FILE, "r") as f:
            return json.load(f)
    return {"categories": []}

def save_categories(data):
    """Save categories to JSON"""
    with open(CATEGORIES_FILE, "w") as f:
        json.dump(data, f, indent=2)

def get_products_in_category(category_name):
    """Get all products in a category"""
    products = load_products()
    return [p for p in products if p.get("category", "").lower() == category_name.lower()]

def generate_category_content(category_name):
    """Generate AI-powered category content"""
    api_key = get_openai_key()
    products = get_products_in_category(category_name)
    
    product_names = [p.get("name", "") for p in products[:10]]
    price_range = {
        "min": min([p.get("price", 0) for p in products]) if products else 0,
        "max": max([p.get("price", 0) for p in products]) if products else 0
    }
    
    if not api_key:
        return generate_fallback_category(category_name, products, price_range)
    
    try:
        prompt = f"""Generate compelling category page content for a pet e-commerce store. Return valid JSON only.

Category: {category_name}
Sample products: {', '.join(product_names[:5])}
Price range: ${price_range['min']:.2f} - ${price_range['max']:.2f}
Product count: {len(products)}

Generate JSON with:
- hero_title: Catchy headline (max 60 chars)
- hero_subtitle: Supporting text (max 120 chars)
- seo_title: SEO page title (max 60 chars)
- seo_description: Meta description (max 160 chars)
- seo_keywords: Array of 8-10 keywords
- featured_text: Short paragraph about why to buy from this category
- subcategories: Array of 3-5 suggested subcategory names
- featured_product_ids: Suggest 4 product types to feature
- banner_color: Hex color for category banner
- icon_emoji: Single emoji representing the category"""

        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": "You are an e-commerce content specialist. Return only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.7
            },
            timeout=30
        )
        
        if response.status_code == 200:
            content = response.json()["choices"][0]["message"]["content"]
            content = content.replace("```json", "").replace("```", "").strip()
            return json.loads(content)
            
    except Exception as e:
        print(f"AI category generation error: {e}")
    
    return generate_fallback_category(category_name, products, price_range)

def generate_fallback_category(category_name, products, price_range):
    """Generate basic category content without AI"""
    
    pet_type = "dog" if "dog" in category_name.lower() else "cat" if "cat" in category_name.lower() else "pet"
    icon = "🐕" if pet_type == "dog" else "🐈" if pet_type == "cat" else "🐾"
    
    return {
        "hero_title": f"Premium {category_name}",
        "hero_subtitle": f"Discover our selection of high-quality {category_name.lower()} for your {pet_type}",
        "seo_title": f"{category_name} | GetPawsy Pet Store",
        "seo_description": f"Shop premium {category_name.lower()} at GetPawsy. Quality products for your {pet_type} with fast US shipping.",
        "seo_keywords": [pet_type, category_name.lower(), "pet products", "pet supplies", "quality", "affordable"],
        "featured_text": f"Our {category_name.lower()} are carefully selected for quality and durability. Every product is tested to ensure your {pet_type} gets the best.",
        "subcategories": [],
        "featured_product_ids": [p.get("id") for p in products[:4]] if products else [],
        "banner_color": "#FF6B6B" if pet_type == "dog" else "#4ECDC4" if pet_type == "cat" else "#45B7D1",
        "icon_emoji": icon
    }

def generate_category(category_name):
    """Generate and save a category"""
    print(f"Generating category: {category_name}")
    
    content = generate_category_content(category_name)
    products = get_products_in_category(category_name)
    
    category_data = {
        "id": category_name.lower().replace(" ", "-"),
        "name": category_name,
        "slug": category_name.lower().replace(" ", "-"),
        **content,
        "product_count": len(products),
        "price_range": {
            "min": min([p.get("price", 0) for p in products]) if products else 0,
            "max": max([p.get("price", 0) for p in products]) if products else 0
        },
        "generated_at": datetime.now().isoformat()
    }
    
    categories = load_categories()
    existing_ids = [c.get("id") for c in categories.get("categories", [])]
    
    if category_data["id"] in existing_ids:
        categories["categories"] = [
            category_data if c.get("id") == category_data["id"] else c
            for c in categories.get("categories", [])
        ]
    else:
        categories.setdefault("categories", []).append(category_data)
    
    categories["updated_at"] = datetime.now().isoformat()
    save_categories(categories)
    
    print(f"Category '{category_name}' generated successfully")
    return category_data

def generate_all_categories():
    """Generate all categories from products"""
    products = load_products()
    
    category_names = set()
    for p in products:
        cat = p.get("category", "")
        if cat:
            category_names.add(cat)
    
    print(f"Found {len(category_names)} categories to generate")
    
    results = []
    for cat_name in category_names:
        result = generate_category(cat_name)
        results.append(result)
    
    return results

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        category_name = " ".join(sys.argv[1:])
        result = generate_category(category_name)
        print(json.dumps(result, indent=2))
    else:
        results = generate_all_categories()
        print(f"Generated {len(results)} categories")
