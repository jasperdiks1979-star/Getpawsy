#!/usr/bin/env python3
"""
===========================================================
 GetPawsy ULTRA V2 — SEARCH ENGINE
 Full-text search, fuzzy matching, filters, and ranking
===========================================================
"""

import os
import re
import json
from pathlib import Path
from difflib import SequenceMatcher

print("🔍 Search Engine Loaded")


def load_products():
    """Load products from data store"""
    if os.path.exists("data/products.json"):
        with open("data/products.json") as f:
            return json.load(f)
    return []


def normalize_text(text):
    """Normalize text for searching"""
    if not text:
        return ""
    text = str(text).lower()
    text = re.sub(r'[^\w\s]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def fuzzy_match(query, text, threshold=0.6):
    """
    Fuzzy string matching using sequence matcher
    Returns similarity score (0-1)
    """
    if not query or not text:
        return 0
    
    query = normalize_text(query)
    text = normalize_text(text)
    
    # Exact match
    if query in text:
        return 1.0
    
    # Word-level matching
    query_words = set(query.split())
    text_words = set(text.split())
    
    word_matches = len(query_words & text_words)
    if word_matches > 0:
        return 0.8 + (word_matches / len(query_words)) * 0.2
    
    # Fuzzy matching
    return SequenceMatcher(None, query, text).ratio()


def calculate_relevance(product, query, filters=None):
    """
    Calculate relevance score for a product
    Higher score = more relevant
    """
    score = 0
    query_lower = normalize_text(query)
    
    # Title match (highest weight)
    title = normalize_text(product.get("title", ""))
    title_score = fuzzy_match(query_lower, title)
    score += title_score * 100
    
    # Exact word match in title
    if query_lower in title:
        score += 50
    
    # Tags match
    tags = product.get("tags", [])
    if isinstance(tags, list):
        for tag in tags:
            tag_score = fuzzy_match(query_lower, str(tag))
            score += tag_score * 20
    
    # SEO description match
    seo_desc = normalize_text(product.get("seo_description", ""))
    desc_score = fuzzy_match(query_lower, seo_desc)
    score += desc_score * 15
    
    # Bullets match
    bullets = product.get("bullets", [])
    if isinstance(bullets, list):
        for bullet in bullets:
            bullet_score = fuzzy_match(query_lower, str(bullet))
            score += bullet_score * 10
    
    # Category match
    category = normalize_text(product.get("category_name", ""))
    if query_lower in category:
        score += 25
    
    # Animal type match
    animal = product.get("animal", "")
    if query_lower in animal.lower():
        score += 30
    
    # Has images bonus
    if product.get("images"):
        score += 5
    
    return score


def apply_filters(products, filters):
    """
    Apply filters to product list
    Filters: category, animal, price_min, price_max, has_images
    """
    filtered = products
    
    if not filters:
        return filtered
    
    # Category filter
    if filters.get("category"):
        cat = filters["category"].lower()
        filtered = [p for p in filtered 
                   if cat in (p.get("category_slug", "") or "").lower()
                   or cat in (p.get("product_type", "") or "").lower()]
    
    # Animal filter
    if filters.get("animal"):
        animal = filters["animal"].lower()
        filtered = [p for p in filtered 
                   if (p.get("animal", "") or "").lower() == animal]
    
    # Price range
    if filters.get("price_min") is not None:
        min_price = float(filters["price_min"])
        filtered = [p for p in filtered if (p.get("price") or 0) >= min_price]
    
    if filters.get("price_max") is not None:
        max_price = float(filters["price_max"])
        filtered = [p for p in filtered if (p.get("price") or 999999) <= max_price]
    
    # Has images
    if filters.get("has_images"):
        filtered = [p for p in filtered if p.get("images")]
    
    return filtered


def sort_products(products, sort_by="relevance", scores=None):
    """
    Sort products by specified criteria
    Options: relevance, price_low, price_high, name
    """
    if sort_by == "relevance" and scores:
        # Sort by pre-calculated scores
        return sorted(products, key=lambda p: scores.get(p.get("id"), 0), reverse=True)
    
    elif sort_by == "price_low":
        return sorted(products, key=lambda p: p.get("price") or 0)
    
    elif sort_by == "price_high":
        return sorted(products, key=lambda p: p.get("price") or 0, reverse=True)
    
    elif sort_by == "name":
        return sorted(products, key=lambda p: (p.get("title") or "").lower())
    
    return products


def search_products(query, filters=None, sort_by="relevance", limit=50):
    """
    Main search function
    Returns sorted, filtered products matching query
    """
    products = load_products()
    
    if not products:
        return {"results": [], "total": 0, "query": query}
    
    # Calculate relevance scores
    scores = {}
    for product in products:
        score = calculate_relevance(product, query, filters)
        scores[product.get("id")] = score
    
    # Filter by minimum score
    min_score = 10
    matched = [p for p in products if scores.get(p.get("id"), 0) >= min_score]
    
    # Apply additional filters
    filtered = apply_filters(matched, filters)
    
    # Sort results
    sorted_results = sort_products(filtered, sort_by, scores)
    
    # Limit results
    results = sorted_results[:limit]
    
    return {
        "results": results,
        "total": len(filtered),
        "query": query,
        "filters": filters,
        "sort": sort_by
    }


def build_search_index():
    """
    Build search index for faster lookups
    Creates index with normalized terms
    """
    products = load_products()
    
    index = {
        "products": {},
        "terms": {},
        "categories": {},
        "animals": {}
    }
    
    for product in products:
        pid = product.get("id")
        if not pid:
            continue
        
        # Index product
        index["products"][pid] = {
            "title": product.get("title"),
            "price": product.get("price"),
            "image": product.get("images", [None])[0] if product.get("images") else None
        }
        
        # Index terms
        title = normalize_text(product.get("title", ""))
        for word in title.split():
            if len(word) > 2:
                if word not in index["terms"]:
                    index["terms"][word] = []
                index["terms"][word].append(pid)
        
        # Index tags
        for tag in product.get("tags", []):
            tag_norm = normalize_text(str(tag))
            if tag_norm:
                if tag_norm not in index["terms"]:
                    index["terms"][tag_norm] = []
                index["terms"][tag_norm].append(pid)
        
        # Index by category
        cat = product.get("category_slug", "other")
        if cat not in index["categories"]:
            index["categories"][cat] = []
        index["categories"][cat].append(pid)
        
        # Index by animal
        animal = product.get("animal", "dog")
        if animal not in index["animals"]:
            index["animals"][animal] = []
        index["animals"][animal].append(pid)
    
    # Save index
    Path("data").mkdir(exist_ok=True)
    with open("data/search_index.json", "w") as f:
        json.dump(index, f, indent=2)
    
    print(f"✔️ Search index built: {len(index['products'])} products, {len(index['terms'])} terms")
    return index


def get_suggestions(query, limit=5):
    """
    Get search suggestions based on partial query
    """
    if not os.path.exists("data/search_index.json"):
        build_search_index()
    
    with open("data/search_index.json") as f:
        index = json.load(f)
    
    query_norm = normalize_text(query)
    suggestions = []
    
    # Find matching terms
    for term in index.get("terms", {}).keys():
        if term.startswith(query_norm):
            suggestions.append({
                "term": term,
                "count": len(index["terms"][term])
            })
    
    # Sort by frequency
    suggestions.sort(key=lambda x: x["count"], reverse=True)
    
    return suggestions[:limit]


# Main execution
if __name__ == "__main__":
    print("\n🔍 GetPawsy Search Engine\n")
    
    # Build search index
    index = build_search_index()
    
    # Test search
    print("\n📊 Testing search...")
    results = search_products("dog toy", limit=5)
    print(f"   Query: 'dog toy'")
    print(f"   Results: {results['total']} products")
    
    for r in results["results"]:
        print(f"   - {r.get('title', 'Unknown')[:50]}")
    
    print("\n✅ engine_search.py ready.")
