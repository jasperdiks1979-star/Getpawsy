#!/usr/bin/env python3
"""
===========================================================
 GetPawsy ULTRA V2 — STOREFRONT ENGINE
 Page builders, routing, and asset management
===========================================================
"""

import os
import json
import re
from pathlib import Path
from datetime import datetime

print("🏪 Storefront Engine Loaded")


def load_products():
    """Load products from data store"""
    if os.path.exists("data/products.json"):
        with open("data/products.json") as f:
            return json.load(f)
    return []


def load_homepage():
    """Load homepage data"""
    if os.path.exists("data/homepage.json"):
        with open("data/homepage.json") as f:
            return json.load(f)
    return None


def load_categories():
    """Load category index"""
    if os.path.exists("data/category_index.json"):
        with open("data/category_index.json") as f:
            return json.load(f)
    return None


def build_home_page():
    """
    Build homepage data structure
    """
    homepage = load_homepage()
    
    if not homepage:
        # Generate fresh homepage
        from engine_homepage import build_homepage_json
        homepage = build_homepage_json()
    
    return {
        "type": "home",
        "title": "GetPawsy - Premium Pet Products",
        "meta": {
            "description": "Shop premium products for dogs and cats. Fast US shipping.",
            "keywords": "pet products, dog toys, cat accessories, pet supplies"
        },
        "data": homepage
    }


def build_category_page(category_slug):
    """
    Build category page data
    """
    products = load_products()
    categories = load_categories()
    
    # Filter products by category
    cat_products = [p for p in products 
                    if category_slug in (p.get("category_slug") or "")]
    
    # Get category info
    parts = category_slug.split("/")
    animal = parts[0] if parts else "dogs"
    subcat = parts[1] if len(parts) > 1 else None
    
    title = f"{animal.title()}"
    if subcat:
        title += f" {subcat.title()}"
    
    return {
        "type": "category",
        "slug": category_slug,
        "title": f"{title} | GetPawsy",
        "meta": {
            "description": f"Shop {title.lower()} at GetPawsy. Fast US shipping.",
            "keywords": f"{animal}, {subcat or 'products'}, pet supplies"
        },
        "data": {
            "category": {
                "slug": category_slug,
                "name": title,
                "animal": animal,
                "subcategory": subcat
            },
            "products": cat_products,
            "total": len(cat_products),
            "filters_available": {
                "price_ranges": [
                    {"label": "Under $10", "min": 0, "max": 10},
                    {"label": "$10 - $25", "min": 10, "max": 25},
                    {"label": "$25 - $50", "min": 25, "max": 50},
                    {"label": "Over $50", "min": 50, "max": None}
                ]
            }
        }
    }


def build_product_page(product_id):
    """
    Build product detail page data
    """
    products = load_products()
    
    # Find product
    product = None
    for p in products:
        if str(p.get("id")) == str(product_id):
            product = p
            break
    
    if not product:
        return {
            "type": "error",
            "status": 404,
            "message": "Product not found"
        }
    
    # Get related products
    related = []
    animal = product.get("animal")
    ptype = product.get("product_type")
    
    for p in products:
        if p.get("id") != product_id:
            if p.get("animal") == animal or p.get("product_type") == ptype:
                related.append(p)
        if len(related) >= 4:
            break
    
    return {
        "type": "product",
        "slug": f"/product/{product_id}",
        "title": f"{product.get('title', 'Product')} | GetPawsy",
        "meta": {
            "description": product.get("seo_description", ""),
            "keywords": ", ".join(product.get("tags", []))
        },
        "data": {
            "product": product,
            "related": related,
            "breadcrumbs": [
                {"label": "Home", "url": "/"},
                {"label": product.get("category_name", "Products"), 
                 "url": f"/collection/{product.get('category_slug', 'all')}"},
                {"label": product.get("title", "Product"), "url": None}
            ]
        }
    }


def build_search_page(query, filters=None, sort="relevance"):
    """
    Build search results page data
    """
    from engine_search import search_products
    
    results = search_products(query, filters, sort)
    
    return {
        "type": "search",
        "title": f"Search: {query} | GetPawsy",
        "meta": {
            "description": f"Search results for '{query}' at GetPawsy",
            "keywords": query
        },
        "data": {
            "query": query,
            "results": results["results"],
            "total": results["total"],
            "filters": filters,
            "sort": sort
        }
    }


def route_request(url, params=None):
    """
    Route helper - determines page type from URL
    Returns appropriate page data
    """
    url = url.strip("/")
    params = params or {}
    
    # Home page
    if not url or url == "":
        return build_home_page()
    
    # Search
    if url == "search" or url.startswith("search"):
        query = params.get("q", "")
        filters = {
            "category": params.get("category"),
            "animal": params.get("animal"),
            "price_min": params.get("price_min"),
            "price_max": params.get("price_max")
        }
        sort = params.get("sort", "relevance")
        return build_search_page(query, filters, sort)
    
    # Product page
    if url.startswith("product/"):
        product_id = url.replace("product/", "")
        return build_product_page(product_id)
    
    # Category pages
    if url.startswith("collection/") or url.startswith("dogs/") or url.startswith("cats/"):
        category_slug = url.replace("collection/", "")
        return build_category_page(category_slug)
    
    # Dogs main
    if url == "dogs":
        return build_category_page("dogs")
    
    # Cats main
    if url == "cats":
        return build_category_page("cats")
    
    # 404
    return {
        "type": "error",
        "status": 404,
        "message": "Page not found"
    }


def build_storefront():
    """
    Build complete storefront data
    Generates all page data for static export
    """
    products = load_products()
    
    storefront = {
        "generated_at": datetime.now().isoformat(),
        "pages": {
            "home": build_home_page(),
            "categories": {},
            "products": {}
        },
        "navigation": {
            "main": [
                {"label": "Dogs", "url": "/dogs", "children": [
                    {"label": "Toys", "url": "/dogs/toys"},
                    {"label": "Beds", "url": "/dogs/beds"},
                    {"label": "Grooming", "url": "/dogs/grooming"},
                    {"label": "Feeding", "url": "/dogs/feeding"},
                    {"label": "Training", "url": "/dogs/training"}
                ]},
                {"label": "Cats", "url": "/cats", "children": [
                    {"label": "Toys", "url": "/cats/toys"},
                    {"label": "Beds", "url": "/cats/beds"},
                    {"label": "Scratchers", "url": "/cats/scratchers"},
                    {"label": "Grooming", "url": "/cats/grooming"}
                ]}
            ]
        },
        "stats": {
            "total_products": len(products),
            "total_pages": 0
        }
    }
    
    # Build category pages
    categories = ["dogs", "cats", "dogs/toys", "dogs/beds", "dogs/grooming",
                  "cats/toys", "cats/beds", "cats/scratchers"]
    
    for cat in categories:
        storefront["pages"]["categories"][cat] = build_category_page(cat)
    
    # Build product pages (limit for performance)
    for product in products[:100]:
        pid = product.get("id")
        if pid:
            storefront["pages"]["products"][pid] = build_product_page(pid)
    
    storefront["stats"]["total_pages"] = (
        1 +  # home
        len(storefront["pages"]["categories"]) +
        len(storefront["pages"]["products"])
    )
    
    # Save storefront
    Path("data").mkdir(exist_ok=True)
    with open("data/storefront.json", "w") as f:
        json.dump(storefront, f, indent=2)
    
    print(f"✔️ Storefront built: {storefront['stats']['total_pages']} pages")
    return storefront


# Main execution
if __name__ == "__main__":
    print("\n🏪 GetPawsy Storefront Engine\n")
    
    storefront = build_storefront()
    
    print(f"\n📊 Storefront Stats:")
    print(f"   Total products: {storefront['stats']['total_products']}")
    print(f"   Total pages: {storefront['stats']['total_pages']}")
    
    print("\n✅ engine_storefront.py ready.")
