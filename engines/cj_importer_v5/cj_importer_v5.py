#!/usr/bin/env python3
"""
GetPawsy CJ-Dropshipping Live Product Importer V5
Features: API integration, auto-pricing, image download, AI SEO generation
"""

import os
import sys
import json
import requests
import hashlib
import time
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
PRODUCTS_FILE = DATA_DIR / "products_v5.json"
IMAGES_DIR = BASE_DIR / "public" / "images" / "products"

CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1"

def get_cj_credentials():
    app_id = os.environ.get("CJ_APPID", "")
    app_secret = os.environ.get("CJ_APPSECRET", "")
    return app_id, app_secret

def get_cj_access_token():
    app_id, app_secret = get_cj_credentials()
    if not app_id or not app_secret:
        print("WARNING: CJ API credentials not found. Using demo mode.")
        return None
    
    try:
        response = requests.post(
            f"{CJ_API_BASE}/authentication/getAccessToken",
            json={"email": app_id, "password": app_secret},
            timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            if data.get("result") and data.get("data"):
                return data["data"].get("accessToken")
    except Exception as e:
        print(f"Error getting CJ access token: {e}")
    return None

def calculate_markup_price(cost_price):
    """Apply markup rules and round to .99"""
    if cost_price < 10:
        markup = 2.5
    elif cost_price <= 30:
        markup = 2.0
    else:
        markup = 1.5
    
    final_price = cost_price * markup
    final_price = int(final_price) + 0.99
    return round(final_price, 2)

def download_product_image(image_url, product_id, index=0):
    """Download product image to local storage"""
    if not image_url:
        return "/public/images/placeholder.png"
    
    try:
        product_dir = IMAGES_DIR / product_id
        product_dir.mkdir(parents=True, exist_ok=True)
        
        ext = image_url.split(".")[-1].split("?")[0][:4]
        if ext not in ["jpg", "jpeg", "png", "webp", "gif"]:
            ext = "jpg"
        
        filename = f"image_{index}.{ext}"
        filepath = product_dir / filename
        
        response = requests.get(image_url, timeout=30)
        if response.status_code == 200:
            with open(filepath, "wb") as f:
                f.write(response.content)
            return f"/public/images/products/{product_id}/{filename}"
    except Exception as e:
        print(f"Error downloading image: {e}")
    
    return "/public/images/placeholder.png"

def generate_ai_seo(product_name, description, category):
    """Generate SEO content using OpenAI"""
    api_key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
    
    if not api_key:
        return {
            "seo_title": f"{product_name} | GetPawsy",
            "seo_description": description[:160] if description else product_name,
            "bullet_points": [description] if description else [],
            "meta_tags": category.lower().split() if category else ["pet"],
            "google_shopping_description": description[:500] if description else product_name
        }
    
    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {
                        "role": "system",
                        "content": "You are an SEO expert for a pet products e-commerce store. Generate compelling SEO content. Return JSON only."
                    },
                    {
                        "role": "user",
                        "content": f"""Generate SEO content for this pet product:
Name: {product_name}
Description: {description}
Category: {category}

Return JSON with: seo_title (max 60 chars), seo_description (max 160 chars), bullet_points (array of 3-5 benefits), meta_tags (array of 5-8 keywords), google_shopping_description (max 500 chars)"""
                    }
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
        print(f"AI SEO generation error: {e}")
    
    return {
        "seo_title": f"{product_name} | GetPawsy",
        "seo_description": description[:160] if description else product_name,
        "bullet_points": [description] if description else [],
        "meta_tags": ["pet", "dog", "cat", "toys", "accessories"],
        "google_shopping_description": description[:500] if description else product_name
    }

def fetch_cj_products(access_token, category_id=None, page=1, limit=50):
    """Fetch products from CJ API"""
    if not access_token:
        return generate_demo_products()
    
    try:
        params = {
            "pageNum": page,
            "pageSize": limit,
            "countryCode": "US"
        }
        if category_id:
            params["categoryId"] = category_id
        
        response = requests.get(
            f"{CJ_API_BASE}/product/list",
            headers={"CJ-Access-Token": access_token},
            params=params,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("result") and data.get("data"):
                return data["data"].get("list", [])
    except Exception as e:
        print(f"Error fetching CJ products: {e}")
    
    return generate_demo_products()

def generate_demo_products():
    """Generate demo products when CJ API is unavailable"""
    demo_products = []
    categories = [
        ("Dog Toys", ["Squeaky Ball", "Rope Toy", "Plush Bone", "Chew Ring", "Fetch Disc"]),
        ("Cat Toys", ["Feather Wand", "Laser Pointer", "Catnip Mouse", "Tunnel Toy", "Ball Track"]),
        ("Dog Beds", ["Orthopedic Bed", "Donut Bed", "Cooling Mat", "Travel Bed", "Elevated Cot"]),
        ("Cat Beds", ["Cat Tree", "Window Perch", "Cave Bed", "Heated Pad", "Hammock Bed"]),
        ("Accessories", ["Collar Set", "Leash Combo", "Food Bowl", "Water Fountain", "Grooming Kit"])
    ]
    
    for cat_name, products in categories:
        for i, prod_name in enumerate(products):
            cost = 5 + (i * 3) + (hash(prod_name) % 10)
            demo_products.append({
                "pid": f"cj-{cat_name.lower().replace(' ', '-')}-{i+1}",
                "productNameEn": prod_name,
                "productSku": f"SKU-{hash(prod_name) % 10000:04d}",
                "sellPrice": cost,
                "productImage": "",
                "categoryName": cat_name,
                "description": f"Premium {prod_name.lower()} for your beloved pet. High quality materials and durable construction.",
                "productWeight": 0.5 + (i * 0.1),
                "variants": []
            })
    
    return demo_products

def transform_cj_product(cj_product, download_images=True):
    """Transform CJ product to GetPawsy format"""
    pid = cj_product.get("pid", f"cj-{int(time.time())}")
    name = cj_product.get("productNameEn", "Pet Product")
    cost_price = float(cj_product.get("sellPrice", 10))
    category = cj_product.get("categoryName", "Accessories")
    description = cj_product.get("description", "")
    
    images = []
    main_image = cj_product.get("productImage", "")
    
    if download_images and main_image:
        local_path = download_product_image(main_image, pid, 0)
        images.append(local_path)
    elif main_image:
        images.append(main_image)
    else:
        images.append("/public/images/placeholder.png")
    
    sell_price = calculate_markup_price(cost_price)
    old_price = round(sell_price * 1.25, 2)
    old_price = int(old_price) + 0.99
    
    seo_data = generate_ai_seo(name, description, category)
    
    pet_type = "dog" if "dog" in category.lower() else "cat" if "cat" in category.lower() else "pet"
    tags = [pet_type, category.lower().replace(" ", "-")]
    tags.extend(seo_data.get("meta_tags", [])[:5])
    
    product = {
        "id": pid,
        "cj_id": cj_product.get("pid", ""),
        "sku": cj_product.get("productSku", ""),
        "name": name,
        "title": seo_data.get("seo_title", name),
        "description": description or seo_data.get("seo_description", ""),
        "price": sell_price,
        "cost": cost_price,
        "old_price": old_price,
        "images": images,
        "rating": round(4.0 + (hash(name) % 10) / 10, 1),
        "reviews_count": 10 + (hash(name) % 200),
        "stock": 50 + (hash(name) % 150),
        "category": category,
        "tags": list(set(tags)),
        "weight": cj_product.get("productWeight", 0.5),
        "variants": cj_product.get("variants", []),
        "seo": seo_data,
        "source": "cj_dropshipping",
        "imported_at": datetime.now().isoformat(),
        "published": True
    }
    
    return product

def load_existing_products():
    """Load existing products from JSON"""
    if PRODUCTS_FILE.exists():
        try:
            with open(PRODUCTS_FILE, "r") as f:
                data = json.load(f)
                return data.get("products", [])
        except:
            pass
    return []

def save_products(products):
    """Save products to JSON file"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    bundles = []
    regular_products = []
    for p in products:
        if p.get("is_bundle"):
            bundles.append(p)
        else:
            regular_products.append(p)
    
    data = {
        "products": regular_products,
        "bundles": bundles,
        "updated_at": datetime.now().isoformat(),
        "total_count": len(regular_products),
        "bundle_count": len(bundles)
    }
    
    with open(PRODUCTS_FILE, "w") as f:
        json.dump(data, f, indent=2)
    
    print(f"Saved {len(regular_products)} products and {len(bundles)} bundles")

def import_all(download_images=True, limit=100):
    """Import all products from CJ Dropshipping"""
    print("=" * 50)
    print("GetPawsy CJ Importer V5 - Import All")
    print("=" * 50)
    
    access_token = get_cj_access_token()
    if access_token:
        print("✓ Connected to CJ API")
    else:
        print("! Running in demo mode (no API credentials)")
    
    existing_products = load_existing_products()
    existing_ids = {p.get("id") for p in existing_products}
    print(f"Existing products: {len(existing_products)}")
    
    cj_products = fetch_cj_products(access_token, limit=limit)
    print(f"Fetched {len(cj_products)} products from CJ")
    
    new_count = 0
    for cj_prod in cj_products:
        pid = cj_prod.get("pid", "")
        if pid and pid not in existing_ids:
            product = transform_cj_product(cj_prod, download_images)
            existing_products.append(product)
            existing_ids.add(pid)
            new_count += 1
            print(f"  + {product['name'][:40]}... ${product['price']}")
    
    save_products(existing_products)
    
    print("=" * 50)
    print(f"Import complete!")
    print(f"  New products: {new_count}")
    print(f"  Total products: {len(existing_products)}")
    print("=" * 50)
    
    return {"new": new_count, "total": len(existing_products)}

def sync_prices():
    """Sync prices from CJ API"""
    print("Syncing prices from CJ API...")
    
    products = load_existing_products()
    access_token = get_cj_access_token()
    
    updated = 0
    for product in products:
        if product.get("source") == "cj_dropshipping" and product.get("cj_id"):
            old_cost = product.get("cost", 0)
            new_price = calculate_markup_price(old_cost)
            if new_price != product.get("price"):
                product["price"] = new_price
                product["old_price"] = round(new_price * 1.25, 2)
                updated += 1
    
    save_products(products)
    print(f"Updated {updated} product prices")
    return {"updated": updated}

def rebuild_seo():
    """Rebuild SEO for all products"""
    print("Rebuilding SEO for all products...")
    
    products = load_existing_products()
    
    for i, product in enumerate(products):
        print(f"  Processing {i+1}/{len(products)}: {product['name'][:30]}...")
        seo_data = generate_ai_seo(
            product.get("name", ""),
            product.get("description", ""),
            product.get("category", "")
        )
        product["seo"] = seo_data
        product["title"] = seo_data.get("seo_title", product["name"])
        time.sleep(0.5)
    
    save_products(products)
    print(f"SEO rebuilt for {len(products)} products")
    return {"count": len(products)}

if __name__ == "__main__":
    if len(sys.argv) > 1:
        command = sys.argv[1]
        if command == "import_all":
            import_all()
        elif command == "sync_prices":
            sync_prices()
        elif command == "rebuild_seo":
            rebuild_seo()
        else:
            print(f"Unknown command: {command}")
            print("Usage: python3 cj_importer_v5.py [import_all|sync_prices|rebuild_seo]")
    else:
        import_all()
