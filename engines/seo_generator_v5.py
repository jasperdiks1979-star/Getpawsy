#!/usr/bin/env python3
"""
GetPawsy AI SEO Generator V5
Auto-generates SEO content for all products
"""

import os
import json
import requests
import time
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
PRODUCTS_FILE = DATA_DIR / "products_v5.json"

def get_openai_key():
    return os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")

def generate_seo_for_product(product):
    """Generate comprehensive SEO for a single product"""
    api_key = get_openai_key()
    
    name = product.get("name", "")
    description = product.get("description", "")
    category = product.get("category", "")
    price = product.get("price", 0)
    tags = product.get("tags", [])
    
    if not api_key:
        return generate_fallback_seo(name, description, category, tags)
    
    try:
        prompt = f"""Generate comprehensive SEO content for this pet product. Return valid JSON only.

Product: {name}
Description: {description}
Category: {category}
Price: ${price}
Tags: {', '.join(tags)}

Generate JSON with these fields:
- seo_title: Compelling title under 60 characters
- seo_description: Meta description under 160 characters
- bullet_points: Array of 4-5 key benefits/features
- meta_tags: Array of 8-10 SEO keywords
- google_shopping_description: Product description for Google Shopping (max 500 chars)
- og_title: Open Graph title for social sharing
- og_description: Open Graph description for social sharing"""

        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": "You are an expert e-commerce SEO specialist. Always return valid JSON."},
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
        print(f"  AI error: {e}")
    
    return generate_fallback_seo(name, description, category, tags)

def generate_fallback_seo(name, description, category, tags):
    """Generate basic SEO without AI"""
    return {
        "seo_title": f"{name} | Premium Pet Products | GetPawsy"[:60],
        "seo_description": (description or f"Shop {name} at GetPawsy. Premium quality {category.lower()} for your pet.")[:160],
        "bullet_points": [
            f"Premium quality {category.lower()}",
            "Durable and safe materials",
            "Fast US shipping",
            "Satisfaction guaranteed"
        ],
        "meta_tags": list(set(["pet", "dog", "cat", category.lower().replace(" ", "-")] + tags[:5])),
        "google_shopping_description": (description or f"{name} - Premium {category.lower()} for pets. High quality, durable, safe.")[:500],
        "og_title": name[:60],
        "og_description": (description or f"Premium {category.lower()} for your pet")[:200]
    }

def regenerate_single_product(product_id):
    """Regenerate SEO for a single product"""
    products = load_products()
    
    for product in products:
        if product.get("id") == product_id:
            print(f"Generating SEO for: {product['name']}")
            seo = generate_seo_for_product(product)
            product["seo"] = seo
            product["title"] = seo.get("seo_title", product["name"])
            product["seo_updated_at"] = datetime.now().isoformat()
            save_products(products)
            return {"success": True, "seo": seo}
    
    return {"success": False, "error": "Product not found"}

def regenerate_all_products(delay=0.5):
    """Regenerate SEO for all products"""
    print("=" * 50)
    print("GetPawsy SEO Generator V5 - Regenerate All")
    print("=" * 50)
    
    products = load_products()
    total = len(products)
    success_count = 0
    
    for i, product in enumerate(products):
        print(f"[{i+1}/{total}] {product['name'][:40]}...")
        
        try:
            seo = generate_seo_for_product(product)
            product["seo"] = seo
            product["title"] = seo.get("seo_title", product["name"])
            product["seo_updated_at"] = datetime.now().isoformat()
            success_count += 1
        except Exception as e:
            print(f"  Error: {e}")
        
        if delay > 0:
            time.sleep(delay)
    
    save_products(products)
    
    print("=" * 50)
    print(f"SEO generation complete!")
    print(f"  Success: {success_count}/{total}")
    print("=" * 50)
    
    return {"success": success_count, "total": total}

def load_products():
    """Load products from JSON"""
    if PRODUCTS_FILE.exists():
        with open(PRODUCTS_FILE, "r") as f:
            data = json.load(f)
            return data.get("products", [])
    return []

def save_products(products):
    """Save products to JSON"""
    if PRODUCTS_FILE.exists():
        with open(PRODUCTS_FILE, "r") as f:
            data = json.load(f)
    else:
        data = {}
    
    data["products"] = products
    data["seo_updated_at"] = datetime.now().isoformat()
    
    with open(PRODUCTS_FILE, "w") as f:
        json.dump(data, f, indent=2)

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        if sys.argv[1] == "regenerate":
            if len(sys.argv) > 2:
                result = regenerate_single_product(sys.argv[2])
            else:
                result = regenerate_all_products()
            print(json.dumps(result, indent=2))
    else:
        regenerate_all_products()
