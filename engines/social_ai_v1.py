"""
GetPawsy ULTRA V5.6 - AI Social Media Auto-Poster Engine
Generates captions, tags, schedules posts, and creates promotional content
"""

import json
import os
import random
from datetime import datetime, timedelta
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
POSTS_FILE = DATA_DIR / "social_posts.json"
SOCIAL_DIR = Path(__file__).parent.parent / "social" / "posts"

HASHTAG_SETS = {
    "dog": ["#dogsofinstagram", "#doglife", "#puppylove", "#doglovers", "#dogtoys", "#happydog", "#dogmom", "#furbaby", "#dogstagram", "#petlovers"],
    "cat": ["#catsofinstagram", "#catlife", "#kittylove", "#catlovers", "#cattoys", "#happycat", "#catmom", "#meow", "#catstagram", "#catlover"],
    "general": ["#petproducts", "#petsupplies", "#petshop", "#petcare", "#getpawsy", "#pawsylife", "#petshopping", "#petessentials", "#treatyourpet", "#petlove"]
}

CAPTION_TEMPLATES = {
    "product_promo": [
        "Your {pet_type} deserves the best! 🐾 Introducing {product_name} — {benefit}. Shop now at GetPawsy! 🛒✨",
        "Level up your {pet_type}'s playtime! 🎾 {product_name} is here to bring endless joy. 💕 Link in bio!",
        "Who's ready for some fun? 🎉 {product_name} is a must-have for every {pet_type} parent! Order today 🛍️",
        "Treat your fur baby to {product_name}! 🌟 {benefit} Shop the collection now! 👉 GetPawsy.pet"
    ],
    "sale": [
        "🔥 FLASH SALE! 🔥 {discount}% OFF {product_name}! Limited time only — don't miss out! 🛒",
        "Your {pet_type} will thank you! 😍 Get {product_name} at {discount}% OFF today only! ⏰",
        "PAWSOME DEAL ALERT! 🚨 {product_name} is now {discount}% OFF! Grab yours before it's gone! 🐾"
    ],
    "new_arrival": [
        "✨ NEW ARRIVAL ✨ Meet {product_name}! {benefit} Now available at GetPawsy! 🛍️",
        "Just dropped! 🎁 {product_name} for your adorable {pet_type}! Be the first to get it! 💫",
        "Fresh off the shelves! 📦 {product_name} is HERE and your {pet_type} is going to LOVE it! 😻🐶"
    ],
    "engagement": [
        "Double tap if your {pet_type} is your best friend! 💕🐾 Share your furry friend in the comments! 👇",
        "What's your {pet_type}'s favorite toy? 🎾 Tell us below! 👇 #PawsyPets",
        "Happy {day_name}! 🌈 Tag a friend who spoils their pet! 🏷️💝"
    ]
}

def load_posts():
    if POSTS_FILE.exists():
        with open(POSTS_FILE, 'r') as f:
            return json.load(f)
    return {"posts": []}

def save_posts(data):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(POSTS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def generate_post_id():
    return f"POST-{datetime.now().strftime('%Y%m%d%H%M%S')}-{random.randint(1000, 9999)}"

def generate_caption(post_type, product=None, pet_type="pet", discount=None):
    templates = CAPTION_TEMPLATES.get(post_type, CAPTION_TEMPLATES["product_promo"])
    template = random.choice(templates)
    
    product_name = product.get("name", "our amazing product") if product else "our amazing product"
    benefit = product.get("description", "made with love for your pet")[:100] if product else "perfect for your furry friend"
    
    caption = template.format(
        pet_type=pet_type,
        product_name=product_name,
        benefit=benefit,
        discount=discount or 20,
        day_name=datetime.now().strftime("%A")
    )
    
    return caption

def generate_tags(pet_type="general", count=8):
    tags = []
    
    if pet_type in HASHTAG_SETS:
        tags.extend(random.sample(HASHTAG_SETS[pet_type], min(4, len(HASHTAG_SETS[pet_type]))))
    
    general_tags = random.sample(HASHTAG_SETS["general"], min(count - len(tags), len(HASHTAG_SETS["general"])))
    tags.extend(general_tags)
    
    return tags[:count]

def generate_post(post_type, product=None, pet_type="pet", discount=None, custom_caption=None):
    caption = custom_caption or generate_caption(post_type, product, pet_type, discount)
    tags = generate_tags(pet_type)
    
    post = {
        "post_id": generate_post_id(),
        "caption": caption,
        "tags": tags,
        "post_type": post_type,
        "product_id": product.get("id") if product else None,
        "product_name": product.get("name") if product else None,
        "image_path": product.get("image") if product else None,
        "pet_type": pet_type,
        "status": "draft",
        "scheduled_time": None,
        "created_at": datetime.now().isoformat(),
        "platforms": ["instagram", "facebook"]
    }
    
    data = load_posts()
    data["posts"].append(post)
    save_posts(data)
    
    return post

def schedule_post(post_id, scheduled_time):
    data = load_posts()
    
    for post in data.get("posts", []):
        if post.get("post_id") == post_id:
            post["scheduled_time"] = scheduled_time
            post["status"] = "scheduled"
            save_posts(data)
            return {"success": True, "post": post}
    
    return {"success": False, "error": "Post not found"}

def get_all_posts(status_filter=None):
    data = load_posts()
    posts = data.get("posts", [])
    
    if status_filter:
        posts = [p for p in posts if p.get("status") == status_filter]
    
    return sorted(posts, key=lambda x: x.get("created_at", ""), reverse=True)

def get_scheduled_posts():
    return get_all_posts("scheduled")

def get_draft_posts():
    return get_all_posts("draft")

def update_post(post_id, updates):
    data = load_posts()
    
    for post in data.get("posts", []):
        if post.get("post_id") == post_id:
            for key, value in updates.items():
                if key != "post_id":
                    post[key] = value
            save_posts(data)
            return {"success": True, "post": post}
    
    return {"success": False, "error": "Post not found"}

def delete_post(post_id):
    data = load_posts()
    data["posts"] = [p for p in data.get("posts", []) if p.get("post_id") != post_id]
    save_posts(data)
    return {"success": True}

def export_post_to_file(post_id):
    data = load_posts()
    
    for post in data.get("posts", []):
        if post.get("post_id") == post_id:
            SOCIAL_DIR.mkdir(parents=True, exist_ok=True)
            
            filename = f"{post_id}.json"
            filepath = SOCIAL_DIR / filename
            
            with open(filepath, 'w') as f:
                json.dump(post, f, indent=2)
            
            post["exported_path"] = str(filepath)
            post["status"] = "exported"
            save_posts(data)
            
            return {"success": True, "path": str(filepath)}
    
    return {"success": False, "error": "Post not found"}

def get_post_stats():
    data = load_posts()
    posts = data.get("posts", [])
    
    return {
        "total": len(posts),
        "drafts": sum(1 for p in posts if p.get("status") == "draft"),
        "scheduled": sum(1 for p in posts if p.get("status") == "scheduled"),
        "exported": sum(1 for p in posts if p.get("status") == "exported"),
        "by_type": {
            "product_promo": sum(1 for p in posts if p.get("post_type") == "product_promo"),
            "sale": sum(1 for p in posts if p.get("post_type") == "sale"),
            "new_arrival": sum(1 for p in posts if p.get("post_type") == "new_arrival"),
            "engagement": sum(1 for p in posts if p.get("post_type") == "engagement")
        }
    }

if __name__ == "__main__":
    print("Social AI Engine V1 - GetPawsy ULTRA V5.6")
    print("Testing...")
    
    product = {"id": "test-1", "name": "Super Squeaky Ball", "description": "The ultimate play toy for dogs!", "image": "/products/ball.jpg"}
    post = generate_post("product_promo", product, "dog")
    print(f"Generated post: {post['caption']}")
    print(f"Tags: {' '.join(post['tags'])}")
