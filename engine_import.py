#!/usr/bin/env python3
"""
===========================================================
 GetPawsy ULTRA V2 Engine — COMPLETE IMPORT MODULE
 All 7 Blocks Combined: Auto-config → DB Writer → Execution
===========================================================
"""

import os
import re
import json
import time
import shutil
import requests
from pathlib import Path

print("\n🐾 GetPawsy ULTRA V2 Engine Starting...\n")

# ===========================================================
#  BLOCK 1 — Auto-config, CJ API Key autodetect, DB autodetect
# ===========================================================

print("🐾 BLOCK 1: Auto-config Engine Loaded")

# -----------------------------------------------------------
# AUTO-DETECT CJ API KEY
# -----------------------------------------------------------

def detect_cj_key():
    """Auto-detect CJ API key from environment, .env, or project files"""
    # 1. Check environment variables
    for k, v in os.environ.items():
        if any(x in k.upper() for x in ["CJ", "CJDROP", "CJ_API", "CJKEY", "CJ_SECRET"]):
            if v and len(v) > 10:
                print(f"🔑 Found CJ API key in environment: {k}")
                return v

    # 2. Check .env file
    if os.path.exists(".env"):
        with open(".env") as f:
            for line in f:
                if "=" in line:
                    k, v = line.strip().split("=", 1)
                    if "CJ" in k.upper() and len(v) > 10:
                        print(f"🔑 Found CJ API key in .env: {k}")
                        return v

    # 3. Scan files for hardcoded key
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in [".git", "node_modules", "__pycache__"]]
        for fname in files:
            if fname.endswith((".py", ".js", ".json", ".txt")):
                try:
                    content = open(os.path.join(root, fname)).read()
                    match = re.search(r"(CJ[A-Z0-9_]*?)['\"]?\s*[:=]\s*['\"]([A-Za-z0-9\-]{20,})", content)
                    if match:
                        print(f"🔑 Found CJ API key inside {fname}")
                        return match.group(2)
                except:
                    pass

    print("❌ ERROR: CJ API KEY NOT FOUND")
    print("Add CJ_API_KEY to Replit Secrets or .env")
    return None


# -----------------------------------------------------------
# AUTO-DETECT DATABASE BACKEND
# -----------------------------------------------------------

def detect_database():
    """Auto-detect database backend"""
    if "DATABASE_URL" in os.environ or "PGHOST" in os.environ:
        print("🗄️ DB = PostgreSQL (Replit)")
        return "postgres"

    if os.path.exists("data/products.json"):
        print("🗄️ DB = JSON file database")
        return "json"

    if os.path.exists("database/products.json"):
        print("🗄️ DB = JSON file database (database/)")
        return "json"

    if "MONGO_URL" in os.environ:
        print("🗄️ DB = MongoDB")
        return "mongo"

    print("🗄️ DB = JSON (fallback)")
    Path("data").mkdir(exist_ok=True)
    return "json"


# -----------------------------------------------------------
# CJ API WRAPPER
# -----------------------------------------------------------

CJ_BASE = "https://developers.cjdropshipping.com/api"

def cj_request(endpoint, payload, api_key):
    """Make a request to CJ API"""
    headers = {
        "CJ-Access-Token": api_key,
        "Content-Type": "application/json"
    }
    try:
        r = requests.post(CJ_BASE + endpoint, json=payload, headers=headers, timeout=30)
        return r.json()
    except Exception as e:
        print(f"❌ CJ API error: {e}")
        return {}


# ===========================================================
#  BLOCK 2 — Fetch 600 Pet Products (US Warehouse Only)
# ===========================================================

print("📦 BLOCK 2: Product Fetcher Loaded")

CACHE_FILE = "data/cj_cache_products.json"

def load_cache():
    """Load cached products if available"""
    if os.path.exists(CACHE_FILE):
        try:
            data = json.load(open(CACHE_FILE))
            if isinstance(data, list) and len(data) > 50:
                print(f"⚡ Loaded {len(data)} cached products.")
                return data
        except:
            pass
    return None


def save_cache(products):
    """Save products to cache"""
    Path("data").mkdir(exist_ok=True)
    with open(CACHE_FILE, "w") as f:
        json.dump(products, f, indent=2)
    print(f"💾 Cached {len(products)} products.")


def fetch_page(page, api_key):
    """Fetch one page of CJ products"""
    payload = {
        "pageNum": page,
        "pageSize": 100,
        "categoryId": "",
        "warehouse": "USA"
    }
    data = cj_request("/product/list", payload, api_key)
    return data.get("data", [])


def fetch_products(api_key, limit=600):
    """Fetch up to 600 pet products from CJ"""
    print("🔍 Collecting pet products from CJ...")
    
    # Attempt to load cache first
    cached = load_cache()
    if cached:
        print("✔️ Using cached product list")
        return cached[:limit]

    all_products = []
    page = 1
    retries = 3

    while len(all_products) < limit:
        print(f" → Requesting page {page}…")

        attempt = 0
        items = []

        while attempt < retries:
            try:
                items = fetch_page(page, api_key)
                if items:
                    break
            except:
                pass

            attempt += 1
            print(f"   ⚠️ Retry {attempt}/{retries}...")
            time.sleep(1)

        if not items:
            print("❌ No more items retrieved — stopping.")
            break

        # Filter items for Dog/Cat related products
        for product in items:
            name = (product.get("productName") or "").lower()
            if any(keyword in name for keyword in ["dog", "cat", "pet", "puppy", "kitten"]):
                all_products.append(product)

        print(f"   ✔️ Total matched so far: {len(all_products)}")

        page += 1
        if page > 20:  # safety cap
            break

    # Save cache for future runs
    if all_products:
        save_cache(all_products)

    return all_products[:limit]


# ===========================================================
#  BLOCK 3 — Image Downloader + Anti-404 HQ Image Repair
# ===========================================================

print("🖼️ BLOCK 3: Image Downloader Loaded")

Path("public").mkdir(exist_ok=True)
Path("public/products").mkdir(exist_ok=True)


def normalize_cj_url(url):
    """Fix CJ image URL: remove size parameters, normalize CDN"""
    if not url:
        return None

    # Remove query parameters (size, format)
    url = url.split("?")[0]

    # Fix common CJ resizing suffixes
    bad_parts = ["_100x100", "_200x200", "_300x300", "_400x400", "_800x800"]
    for b in bad_parts:
        url = url.replace(b, "")

    # Fix CDN variations
    url = url.replace("image.cjdropshipping.com/im/resize", "image.cjdropshipping.com")
    url = url.replace("image.cjdropshipping.com/im/crop", "image.cjdropshipping.com")

    return url


def try_download(url):
    """Try downloading a URL once"""
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200 and len(response.content) > 500:
            return response.content
    except:
        pass
    return None


def download_image_with_repair(url, product_id, index):
    """Download an image with fallback recovery (anti-404)"""
    if not url:
        return None

    url = normalize_cj_url(url)
    if not url:
        return None

    # Determine file extension safely
    ext = url.split(".")[-1].lower()
    if ext not in ["jpg", "jpeg", "png", "webp"]:
        ext = "jpg"

    # Destination path
    folder = Path(f"public/products/{product_id}")
    folder.mkdir(parents=True, exist_ok=True)

    dest_path = folder / f"img_{index}.{ext}"

    # Try direct download
    data = try_download(url)
    if data:
        with open(dest_path, "wb") as f:
            f.write(data)
        return str(dest_path)

    # Fallback 1: Force JPG extension
    fallback1 = url.rsplit(".", 1)[0] + ".jpg"
    data = try_download(fallback1)
    if data:
        with open(dest_path, "wb") as f:
            f.write(data)
        return str(dest_path)

    # Fallback 2: Force PNG extension
    fallback2 = url.rsplit(".", 1)[0] + ".png"
    data = try_download(fallback2)
    if data:
        with open(dest_path, "wb") as f:
            f.write(data)
        return str(dest_path)

    # Fallback 3: Try HTTP instead of HTTPS
    if "https://" in url:
        stripped = url.replace("https://", "http://")
        data = try_download(stripped)
        if data:
            with open(dest_path, "wb") as f:
                f.write(data)
            return str(dest_path)

    print(f"⚠️ Could NOT repair image: {url[:60]}...")
    return None


def download_all_images(product):
    """Download all images for a product"""
    product_id = product.get("productId")
    raw_imgs = []

    # Main image field
    if product.get("productImage"):
        raw_imgs.extend(product["productImage"].split(","))

    # DetailImages (if present)
    if product.get("detailImg"):
        raw_imgs.extend(product["detailImg"].split(","))

    # Variant images
    for v in product.get("variantList", []):
        if v.get("variantImg"):
            raw_imgs.append(v["variantImg"])

    # Remove duplicates
    raw_imgs = list(dict.fromkeys(raw_imgs))

    local_paths = []

    for i, img_url in enumerate(raw_imgs[:5]):  # Limit to 5 images per product
        local_path = download_image_with_repair(img_url, product_id, i)
        if local_path:
            # Convert filesystem path to web path
            local_paths.append(local_path.replace("public", ""))

    return local_paths


# ===========================================================
#  BLOCK 4 — AI SEO Engine (OpenAI-powered)
# ===========================================================

print("🤖 BLOCK 4: AI SEO Engine Loaded")


def detect_openai_key():
    """Detect OpenAI API key"""
    for k, v in os.environ.items():
        if "OPENAI" in k.upper() and v and len(v) > 10:
            print(f"🔑 Found OpenAI Key: {k}")
            return v

    if os.path.exists(".env"):
        with open(".env") as f:
            for line in f:
                if "OPENAI" in line.upper() and "=" in line:
                    key = line.split("=")[1].strip()
                    if len(key) > 10:
                        print("🔑 Found OpenAI Key in .env")
                        return key

    print("⚠️ No OpenAI key found — SEO will use fallback values.")
    return None


def ai_generate_seo(title, description, openai_key):
    """Generate SEO content using AI or fallback"""
    
    # If no AI available → fallback
    if not openai_key:
        return {
            "title": title,
            "seo_title": f"{title} for Dogs & Cats | GetPawsy",
            "seo_description": f"Premium pet accessory: {title}. Fast US shipping.",
            "bullets": ["Fast shipping", "US warehouse", "High quality"],
            "tags": ["pet", "dog", "cat"]
        }

    prompt = f"""Generate SEO optimized product content for a US pet ecommerce website.

Product Title: {title}
Product Description: {description}

Return as a JSON object:
- title
- seo_title
- seo_description
- bullets (3 short)
- tags (5 short)"""

    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {openai_key}"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}]
            },
            timeout=30
        )

        data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")

        # Remove code blocks if present
        content = content.replace("```json", "").replace("```", "").strip()

        seo = json.loads(content)
        return seo

    except Exception as e:
        print(f"⚠️ SEO generation failed: {e}")
        return {
            "title": title,
            "seo_title": f"{title} | GetPawsy Pet Store",
            "seo_description": f"{title} available now with fast US shipping.",
            "bullets": ["Great quality", "US stock", "Fast delivery"],
            "tags": ["pet", "dog", "cat"]
        }


# ===========================================================
#  BLOCK 5 — PRODUCT BUILDER ENGINE
# ===========================================================

print("🛠️ BLOCK 5: Product Builder Engine Loaded")


def smart_price(cost):
    """Apply smart markup based on cost tier"""
    try:
        cost = float(cost)
    except:
        cost = 5.0

    if cost <= 5:
        return round(cost * 3.0, 2)
    if cost <= 15:
        return round(cost * 2.4, 2)
    if cost <= 50:
        return round(cost * 1.8, 2)
    return round(cost * 1.4, 2)


def clean_text(text):
    """Sanitize text strings"""
    if not text:
        return ""
    return text.replace("\n", " ").replace("\r", " ").strip()


def build_product(product_raw, openai_key):
    """Build the final product dict for the store"""

    pid = product_raw.get("productId")
    name = clean_text(product_raw.get("productName", "Pet Product"))
    desc = clean_text(product_raw.get("productDescription", ""))

    print(f"   🧩 Building product: {pid}...")

    # 1. Download all images
    local_images = download_all_images(product_raw)

    if not local_images:
        print(f"   ⚠️ WARNING: No images for {pid}")

    # 2. Smart price
    cost = product_raw.get("sellPrice", 5)
    final_price = smart_price(cost)

    # 3. AI SEO data
    seo = ai_generate_seo(name, desc, openai_key)

    # 4. Tags normalization
    tags = seo.get("tags", [])
    tags = [t.lower().strip() for t in tags if t]

    # 5. Variants (if any)
    variants = []
    for v in product_raw.get("variantList", []):
        variants.append({
            "id": v.get("variantId"),
            "name": clean_text(v.get("variantName")),
            "sku": v.get("variantSku"),
            "price": smart_price(v.get("variantSellPrice", cost)),
            "img": v.get("variantImg", "")
        })

    # 6. Build final product object
    product = {
        "id": pid,
        "title": seo.get("title", name),
        "price": final_price,
        "images": local_images,
        "bullets": seo.get("bullets", []),
        "tags": tags,
        "seo_title": seo.get("seo_title", name),
        "seo_description": seo.get("seo_description", desc),
        "category": "pets",
        "variants": variants,
        "published": True
    }

    print(f"   ✔️ Built: {pid}")

    return product


# ===========================================================
#  BLOCK 6 — Database Writer + Auto-Publish Engine
# ===========================================================

print("💾 BLOCK 6: Database Writer Loaded")


def load_json_db():
    """Load JSON DB"""
    for path in ["data/products.json", "database/products.json"]:
        if os.path.exists(path):
            try:
                with open(path) as f:
                    return json.load(f)
            except:
                pass
    return []


def save_json_db(data):
    """Save JSON DB"""
    Path("data").mkdir(exist_ok=True)
    with open("data/products.json", "w") as f:
        json.dump(data, f, indent=2)
    print("💾 JSON database updated.")


def write_postgres(products):
    """Write products to PostgreSQL"""
    print("🗄️ Writing products to PostgreSQL...")

    try:
        import psycopg2
    except ImportError:
        print("❌ psycopg2 not installed — falling back to JSON")
        return False

    url = os.environ.get("DATABASE_URL")

    if not url:
        print("❌ DATABASE_URL missing — cannot write to Postgres")
        return False

    try:
        conn = psycopg2.connect(url)
        cur = conn.cursor()

        # Create table if needed
        cur.execute("""
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                title TEXT,
                price NUMERIC,
                images JSONB,
                bullets JSONB,
                tags JSONB,
                seo_title TEXT,
                seo_description TEXT,
                category TEXT,
                variants JSONB,
                published BOOLEAN
            );
        """)

        conn.commit()

        for p in products:
            cur.execute("""
                INSERT INTO products (
                    id, title, price, images, bullets, tags,
                    seo_title, seo_description, category, variants, published
                )
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    price = EXCLUDED.price,
                    images = EXCLUDED.images,
                    bullets = EXCLUDED.bullets,
                    tags = EXCLUDED.tags,
                    seo_title = EXCLUDED.seo_title,
                    seo_description = EXCLUDED.seo_description,
                    category = EXCLUDED.category,
                    variants = EXCLUDED.variants,
                    published = EXCLUDED.published;
            """, (
                p["id"],
                p["title"],
                p["price"],
                json.dumps(p["images"]),
                json.dumps(p["bullets"]),
                json.dumps(p["tags"]),
                p["seo_title"],
                p["seo_description"],
                p["category"],
                json.dumps(p["variants"]),
                p["published"]
            ))

        conn.commit()
        cur.close()
        conn.close()

        print("🎉 PostgreSQL database updated!")
        return True
    except Exception as e:
        print(f"❌ PostgreSQL error: {e}")
        return False


def write_json(products):
    """Write to JSON fallback database"""
    print("🗄️ Writing products to JSON DB...")
    save_json_db(products)
    return True


def apply_publish_logic(products):
    """Filter and publish products"""
    clean = []

    for p in products:
        if not p.get("images"):
            print(f"⚠️ Product {p['id']} skipped (no images)")
            continue

        if not p.get("title"):
            continue

        p["published"] = True
        clean.append(p)

    print(f"✔️ {len(clean)} products ready for publishing.")
    return clean


def write_all_products(products, db_type):
    """Write products to detected database"""
    products = apply_publish_logic(products)

    if db_type == "postgres":
        success = write_postgres(products)
        if not success:
            write_json(products)
    else:
        write_json(products)

    return products


# ===========================================================
#  BLOCK 7 — Main Import Execution Loop
# ===========================================================

print("🚀 BLOCK 7: Execution Engine Loaded")


def run_import():
    """Main import execution loop"""
    print("\n" + "=" * 60)
    print("  GetPawsy ULTRA V2 — IMPORT ENGINE")
    print("=" * 60 + "\n")

    # Step 1: Detect CJ API key
    cj_key = detect_cj_key()
    if not cj_key:
        print("\n❌ IMPORT ABORTED: No CJ API key found")
        return False

    # Step 2: Detect database
    db_type = detect_database()

    # Step 3: Detect OpenAI key
    openai_key = detect_openai_key()

    # Step 4: Fetch products
    print("\n📦 FETCHING PRODUCTS FROM CJ...")
    raw_products = fetch_products(cj_key, limit=600)

    if not raw_products:
        print("❌ No products fetched from CJ")
        return False

    print(f"\n✔️ Fetched {len(raw_products)} raw products\n")

    # Step 5: Build products
    print("🛠️ BUILDING PRODUCT OBJECTS...")
    built_products = []

    for i, raw in enumerate(raw_products):
        try:
            product = build_product(raw, openai_key)
            built_products.append(product)

            if (i + 1) % 10 == 0:
                print(f"   Progress: {i + 1}/{len(raw_products)}")

        except Exception as e:
            print(f"⚠️ Error building product: {e}")
            continue

    print(f"\n✔️ Built {len(built_products)} products\n")

    # Step 6: Write to database
    print("💾 WRITING TO DATABASE...")
    final_products = write_all_products(built_products, db_type)

    # Step 7: Summary
    print("\n" + "=" * 60)
    print("  🎉 IMPORT COMPLETE")
    print("=" * 60)
    print(f"  ✅ Products imported: {len(final_products)}")
    print(f"  ✅ Database: {db_type}")
    print(f"  ✅ Images saved to: public/products/")
    print("=" * 60 + "\n")

    return True


# ===========================================================
#  MAIN ENTRY POINT
# ===========================================================

if __name__ == "__main__":
    try:
        run_import()
    except KeyboardInterrupt:
        print("\n\n⚠️ Import cancelled by user")
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
