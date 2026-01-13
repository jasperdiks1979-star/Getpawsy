#!/usr/bin/env python3
"""
GetPawsy AI Conversation-to-Cart Engine (C2C) V5.3
Parse user intent and manage cart actions through natural language
"""

import os
import json
import re
import requests
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
PRODUCTS_FILE = DATA_DIR / "products_v5.json"
SESSIONS_FILE = DATA_DIR / "c2c_sessions.json"

def get_openai_key():
    return os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")

def load_products():
    """Load all products"""
    if PRODUCTS_FILE.exists():
        with open(PRODUCTS_FILE, "r") as f:
            data = json.load(f)
            return data.get("products", [])
    return []

def load_sessions():
    """Load C2C sessions"""
    if SESSIONS_FILE.exists():
        with open(SESSIONS_FILE, "r") as f:
            return json.load(f)
    return {}

def save_sessions(sessions):
    """Save C2C sessions"""
    with open(SESSIONS_FILE, "w") as f:
        json.dump(sessions, f, indent=2)

def parse_intent_with_ai(user_query):
    """Use AI to parse user intent from natural language"""
    api_key = get_openai_key()
    
    if not api_key:
        return parse_intent_basic(user_query)
    
    try:
        prompt = f"""Analyze this shopping request and extract the intent. Return valid JSON only.

User said: "{user_query}"

Return JSON with:
- action: "add", "remove", "update", "search", "question", or "unknown"
- product_keywords: array of keywords to search for products
- quantity: number (default 1)
- pet_type: "dog", "cat", or null
- category: product category if mentioned
- price_range: {{min, max}} if mentioned
- confidence: 0-1 score

Examples:
"add the blue dog toy" -> {{"action":"add","product_keywords":["blue","dog","toy"],"quantity":1}}
"remove squeaky ball" -> {{"action":"remove","product_keywords":["squeaky","ball"]}}
"I want 2 cat beds" -> {{"action":"add","product_keywords":["cat","bed"],"quantity":2}}"""

        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": "You are a shopping intent parser. Return only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.3
            },
            timeout=15
        )
        
        if response.status_code == 200:
            content = response.json()["choices"][0]["message"]["content"]
            content = content.replace("```json", "").replace("```", "").strip()
            return json.loads(content)
            
    except Exception as e:
        print(f"AI intent parsing error: {e}")
    
    return parse_intent_basic(user_query)

def parse_intent_basic(user_query):
    """Basic intent parsing without AI"""
    query_lower = user_query.lower()
    
    intent = {
        "action": "unknown",
        "product_keywords": [],
        "quantity": 1,
        "pet_type": None,
        "category": None,
        "confidence": 0.5
    }
    
    if any(word in query_lower for word in ["add", "want", "buy", "get", "need", "order"]):
        intent["action"] = "add"
    elif any(word in query_lower for word in ["remove", "delete", "take out", "don't want"]):
        intent["action"] = "remove"
    elif any(word in query_lower for word in ["change", "update", "modify"]):
        intent["action"] = "update"
    elif any(word in query_lower for word in ["find", "search", "show", "looking for"]):
        intent["action"] = "search"
    elif "?" in query_lower:
        intent["action"] = "question"
    
    if "dog" in query_lower:
        intent["pet_type"] = "dog"
    elif "cat" in query_lower:
        intent["pet_type"] = "cat"
    
    quantity_match = re.search(r'\b(\d+)\b', query_lower)
    if quantity_match:
        intent["quantity"] = int(quantity_match.group(1))
    
    stop_words = {"add", "want", "buy", "get", "need", "the", "a", "an", "to", "for", "my", "please", "i", "can", "you"}
    words = re.findall(r'\b\w+\b', query_lower)
    intent["product_keywords"] = [w for w in words if w not in stop_words and len(w) > 2]
    
    return intent

def search_products(keywords, pet_type=None, category=None):
    """Search products by keywords"""
    products = load_products()
    
    if not keywords:
        return []
    
    scored_products = []
    for product in products:
        if not product.get("published", True):
            continue
        
        score = 0
        name_lower = product.get("name", "").lower()
        desc_lower = product.get("description", "").lower()
        tags = [t.lower() for t in product.get("tags", [])]
        prod_category = product.get("category", "").lower()
        
        for keyword in keywords:
            keyword = keyword.lower()
            if keyword in name_lower:
                score += 10
            if keyword in desc_lower:
                score += 5
            if keyword in tags:
                score += 7
            if keyword in prod_category:
                score += 6
        
        if pet_type:
            if pet_type in tags or pet_type in prod_category:
                score += 5
        
        if category and category.lower() in prod_category:
            score += 8
        
        if score > 0:
            scored_products.append((product, score))
    
    scored_products.sort(key=lambda x: x[1], reverse=True)
    
    return [p[0] for p in scored_products[:5]]

def process_cart_action(user_query, session_id=None):
    """Process a user query and return cart action"""
    
    intent = parse_intent_with_ai(user_query)
    
    response = {
        "status": "success",
        "action": None,
        "product": None,
        "products": [],
        "message": "",
        "intent": intent
    }
    
    if intent["action"] == "add":
        products = search_products(
            intent.get("product_keywords", []),
            intent.get("pet_type"),
            intent.get("category")
        )
        
        if products:
            response["action"] = "add"
            response["product"] = products[0]
            response["products"] = products[:3]
            response["quantity"] = intent.get("quantity", 1)
            response["message"] = f"Found '{products[0]['name']}' - adding to your cart!"
        else:
            response["status"] = "not_found"
            response["message"] = "I couldn't find a matching product. Can you describe it differently?"
    
    elif intent["action"] == "remove":
        products = search_products(intent.get("product_keywords", []))
        
        if products:
            response["action"] = "remove"
            response["product"] = products[0]
            response["message"] = f"Removing '{products[0]['name']}' from your cart."
        else:
            response["status"] = "not_found"
            response["message"] = "I couldn't find that product in your cart."
    
    elif intent["action"] == "search":
        products = search_products(
            intent.get("product_keywords", []),
            intent.get("pet_type"),
            intent.get("category")
        )
        
        response["action"] = "search"
        response["products"] = products
        if products:
            response["message"] = f"Found {len(products)} products matching your search!"
        else:
            response["message"] = "No products found. Try different keywords!"
    
    elif intent["action"] == "question":
        response["action"] = "question"
        response["message"] = "Let me help you with that!"
    
    else:
        products = search_products(intent.get("product_keywords", []))
        if products:
            response["action"] = "suggest"
            response["products"] = products
            response["message"] = f"Here are some products you might like!"
        else:
            response["status"] = "unclear"
            response["message"] = "I'm not sure what you're looking for. Could you be more specific?"
    
    return response

def format_product_for_response(product):
    """Format product data for API response"""
    return {
        "id": product.get("id"),
        "name": product.get("name"),
        "title": product.get("title"),
        "price": product.get("price"),
        "old_price": product.get("old_price"),
        "image": product.get("images", ["/public/images/placeholder.png"])[0],
        "rating": product.get("rating"),
        "category": product.get("category"),
        "stock": product.get("stock", 0)
    }

if __name__ == "__main__":
    test_queries = [
        "I want to add the squeaky dog toy",
        "Show me some cat beds",
        "Remove the rope toy from my cart",
        "I need 2 dog collars",
        "What do you recommend for puppies?"
    ]
    
    print("Testing C2C Engine:")
    print("=" * 50)
    
    for query in test_queries:
        print(f"\nQuery: {query}")
        result = process_cart_action(query)
        print(f"Action: {result['action']}")
        print(f"Message: {result['message']}")
        if result.get("product"):
            print(f"Product: {result['product'].get('name')}")
