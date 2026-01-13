#!/usr/bin/env python3
"""
Extract embedded images from Excel Column A and match them to products
"""

import os
import sys
import json
import hashlib
from zipfile import ZipFile
from xml.etree import ElementTree as ET

XLSX_PATH = 'attached_assets/cj_products_with_images.xlsx'
CACHE_DIR = 'public/cache/images'
DB_PATH = 'data/db.json'

def extract_images_from_xlsx(xlsx_path, output_dir):
    """
    Extract all embedded images from an XLSX file.
    XLSX files are ZIP archives containing image files in xl/media/
    """
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    images = []
    
    print(f"Opening XLSX as ZIP archive: {xlsx_path}")
    
    with ZipFile(xlsx_path, 'r') as zip_file:
        # List all files in the archive
        all_files = zip_file.namelist()
        
        # Find image files (usually in xl/media/)
        image_files = [f for f in all_files if f.startswith('xl/media/') and 
                      any(f.lower().endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.gif', '.webp'])]
        
        print(f"Found {len(image_files)} embedded images in XLSX")
        
        for i, img_path in enumerate(image_files):
            try:
                # Read the image data
                img_data = zip_file.read(img_path)
                
                # Generate a unique filename based on content hash
                img_hash = hashlib.md5(img_data).hexdigest()[:8]
                ext = os.path.splitext(img_path)[1].lower()
                if not ext:
                    ext = '.jpg'
                
                # Create filename
                new_filename = f"cj_product_{i:03d}_{img_hash}{ext}"
                output_path = os.path.join(output_dir, new_filename)
                
                # Save the image
                with open(output_path, 'wb') as f:
                    f.write(img_data)
                
                images.append({
                    'index': i,
                    'original_path': img_path,
                    'cached_path': f"/cache/images/{new_filename}",
                    'filename': new_filename,
                    'size': len(img_data)
                })
                
                if (i + 1) % 50 == 0:
                    print(f"  Extracted {i + 1}/{len(image_files)} images...")
                    
            except Exception as e:
                print(f"  Error extracting {img_path}: {e}")
    
    print(f"Successfully extracted {len(images)} images to {output_dir}")
    return images


def parse_drawing_relations(xlsx_path):
    """
    Parse the drawing relationships to map images to row positions
    """
    row_to_image = {}
    
    try:
        with ZipFile(xlsx_path, 'r') as zip_file:
            all_files = zip_file.namelist()
            
            # Find drawing files
            drawing_files = [f for f in all_files if 'drawing' in f.lower() and f.endswith('.xml')]
            
            for drawing_file in drawing_files:
                try:
                    xml_content = zip_file.read(drawing_file).decode('utf-8')
                    # Parse XML to find anchor positions
                    root = ET.fromstring(xml_content)
                    
                    # Find all anchor elements with row info
                    for elem in root.iter():
                        if 'row' in elem.tag.lower():
                            print(f"Found row element: {elem.tag}")
                            
                except Exception as e:
                    print(f"Error parsing {drawing_file}: {e}")
                    
    except Exception as e:
        print(f"Error reading drawing relations: {e}")
    
    return row_to_image


def update_products_with_images(images, db_path):
    """
    Update the product database with extracted images
    """
    if not os.path.exists(db_path):
        print(f"Database not found: {db_path}")
        return
    
    with open(db_path, 'r') as f:
        db = json.load(f)
    
    products = db.get('products', [])
    cj_products = [p for p in products if p.get('source') == 'CJ' or p.get('id', '').startswith('cj-')]
    
    print(f"Found {len(cj_products)} CJ products to update")
    print(f"Available images: {len(images)}")
    
    # Simple mapping: assign images to products in order
    # This assumes images are in the same order as products
    updated_count = 0
    
    for i, product in enumerate(cj_products):
        if i < len(images):
            img = images[i]
            product['image'] = img['cached_path']
            product['images'] = [img['cached_path']]
            product['active'] = True
            updated_count += 1
            
            # Also update variant images if they exist
            for variant in product.get('variants', []):
                if 'image' in variant:
                    variant['image'] = img['cached_path']
    
    # Save updated database
    with open(db_path, 'w') as f:
        json.dump(db, f, indent=2)
    
    print(f"Updated {updated_count} products with real images")
    return updated_count


def main():
    print("=" * 60)
    print("CJ Products Image Extractor")
    print("=" * 60)
    
    if not os.path.exists(XLSX_PATH):
        print(f"ERROR: XLSX file not found: {XLSX_PATH}")
        sys.exit(1)
    
    file_size = os.path.getsize(XLSX_PATH)
    print(f"XLSX file size: {file_size / (1024*1024):.1f} MB")
    
    # Step 1: Extract images
    print("\n[Step 1] Extracting embedded images from XLSX...")
    images = extract_images_from_xlsx(XLSX_PATH, CACHE_DIR)
    
    if not images:
        print("ERROR: No images extracted!")
        sys.exit(1)
    
    # Step 2: Update product database
    print(f"\n[Step 2] Updating product database with {len(images)} images...")
    update_products_with_images(images, DB_PATH)
    
    print("\n" + "=" * 60)
    print("COMPLETE!")
    print(f"  - Extracted: {len(images)} images")
    print(f"  - Cached to: {CACHE_DIR}")
    print(f"  - Database: {DB_PATH}")
    print("=" * 60)


if __name__ == '__main__':
    main()
