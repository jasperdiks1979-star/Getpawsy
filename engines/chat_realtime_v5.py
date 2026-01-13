#!/usr/bin/env python3
"""
GetPawsy Live AI Chat Assist Engine V5 RealTime
WebSocket-based real-time chat with personalization
"""

import os
import json
import requests
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
PRODUCTS_FILE = DATA_DIR / "products_v5.json"
CHAT_MEMORY_FILE = DATA_DIR / "chat_memory.json"
USER_PROFILES_FILE = DATA_DIR / "user_profiles.json"

def get_openai_key():
    return os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")

def load_products():
    """Load all products"""
    if PRODUCTS_FILE.exists():
        with open(PRODUCTS_FILE, "r") as f:
            data = json.load(f)
            return data.get("products", [])
    return []

def load_chat_memory(session_id):
    """Load chat memory for a session"""
    if CHAT_MEMORY_FILE.exists():
        with open(CHAT_MEMORY_FILE, "r") as f:
            data = json.load(f)
            return data.get(session_id, {"messages": [], "context": {}})
    return {"messages": [], "context": {}}

def save_chat_memory(session_id, memory):
    """Save chat memory for a session"""
    if CHAT_MEMORY_FILE.exists():
        with open(CHAT_MEMORY_FILE, "r") as f:
            data = json.load(f)
    else:
        data = {}
    
    data[session_id] = memory
    data[session_id]["updated_at"] = datetime.now().isoformat()
    
    with open(CHAT_MEMORY_FILE, "w") as f:
        json.dump(data, f, indent=2)

def load_user_profile(user_id):
    """Load user profile for personalization"""
    if USER_PROFILES_FILE.exists():
        with open(USER_PROFILES_FILE, "r") as f:
            data = json.load(f)
            return data.get(user_id, {})
    return {}

def search_products_realtime(query, limit=5):
    """Fast product search for real-time responses"""
    products = load_products()
    query_lower = query.lower()
    words = query_lower.split()
    
    scored = []
    for product in products:
        if not product.get("published", True):
            continue
        
        score = 0
        name_lower = product.get("name", "").lower()
        desc_lower = product.get("description", "").lower()
        tags = [t.lower() for t in product.get("tags", [])]
        
        for word in words:
            if len(word) < 3:
                continue
            if word in name_lower:
                score += 10
            if word in desc_lower:
                score += 3
            if word in tags:
                score += 5
        
        if score > 0:
            scored.append((product, score))
    
    scored.sort(key=lambda x: x[1], reverse=True)
    return [p[0] for p in scored[:limit]]

def get_product_reviews_quote(product_id):
    """Get a quote from product reviews"""
    reviews_file = DATA_DIR / "reviews.json"
    if reviews_file.exists():
        with open(reviews_file, "r") as f:
            reviews = json.load(f)
            product_reviews = [r for r in reviews if r.get("product_id") == product_id]
            if product_reviews:
                best = max(product_reviews, key=lambda r: r.get("rating", 0))
                return f"'{best.get('text', '')}' - {best.get('author', 'Customer')}"
    return None

def generate_personalized_response(message, session_id, user_id=None):
    """Generate a personalized AI response"""
    api_key = get_openai_key()
    
    memory = load_chat_memory(session_id)
    user_profile = load_user_profile(user_id) if user_id else {}
    
    products = search_products_realtime(message)
    product_context = ""
    if products:
        product_context = "\n\nRelevant products found:\n"
        for p in products[:3]:
            product_context += f"- {p['name']} (${p['price']}) - {p.get('rating', 0)} stars\n"
    
    user_context = ""
    if user_profile:
        pet_type = user_profile.get("pet_type", "")
        if pet_type:
            user_context = f"\n\nUser has a {pet_type}."
    
    history = memory.get("messages", [])[-6:]
    
    if not api_key:
        return {
            "response": f"Woof! I'd love to help you find the perfect pet products! {product_context}",
            "products": products[:3],
            "suggestions": ["Browse dog toys", "See cat beds", "View bestsellers"]
        }
    
    try:
        messages = [
            {
                "role": "system",
                "content": f"""You are Pawsy, a friendly and helpful AI assistant for GetPawsy pet store.
Be enthusiastic, use pet-related puns, and be genuinely helpful.
Always try to recommend relevant products when appropriate.
Keep responses concise but warm.{user_context}{product_context}"""
            }
        ]
        
        for h in history:
            messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
        
        messages.append({"role": "user", "content": message})
        
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": messages,
                "temperature": 0.8,
                "max_tokens": 300
            },
            timeout=15
        )
        
        if response.status_code == 200:
            ai_response = response.json()["choices"][0]["message"]["content"]
            
            memory["messages"].append({"role": "user", "content": message})
            memory["messages"].append({"role": "assistant", "content": ai_response})
            
            if len(memory["messages"]) > 20:
                memory["messages"] = memory["messages"][-20:]
            
            save_chat_memory(session_id, memory)
            
            return {
                "response": ai_response,
                "products": products[:3] if products else [],
                "suggestions": generate_suggestions(message, products)
            }
            
    except Exception as e:
        print(f"Chat AI error: {e}")
    
    return {
        "response": "Woof! I hit a little snag, but I'm still here to help! 🐾",
        "products": products[:3] if products else [],
        "suggestions": ["Browse products", "Contact support"]
    }

def generate_suggestions(message, products):
    """Generate follow-up suggestions"""
    suggestions = []
    
    if products:
        suggestions.append(f"View {products[0]['name']}")
        if len(products) > 1:
            suggestions.append("Compare similar products")
    
    if "dog" in message.lower():
        suggestions.append("Browse all dog products")
    elif "cat" in message.lower():
        suggestions.append("Browse all cat products")
    
    if not suggestions:
        suggestions = ["View bestsellers", "See new arrivals", "Check deals"]
    
    return suggestions[:3]

def transcribe_voice(audio_data):
    """Transcribe voice input using OpenAI Whisper"""
    api_key = get_openai_key()
    
    if not api_key:
        return {"error": "Voice transcription unavailable"}
    
    return {"text": "Voice transcription placeholder"}

if __name__ == "__main__":
    test_message = "I'm looking for a good toy for my golden retriever"
    result = generate_personalized_response(test_message, "test-session-123")
    print(json.dumps(result, indent=2))
