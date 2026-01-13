import os
import zipfile
from pathlib import Path

# 1. Sets en submappen gedefinieerd:
sets = {
    "set1": ["desktop", "tablet", "mobile", "mobile_xl", "ultrawide"],
    "set2": ["desktop", "tablet", "mobile", "mobile_xl", "ultrawide"],
    "set3": ["desktop", "tablet", "mobile", "mobile_xl", "ultrawide"],
    "set4": ["desktop", "tablet", "mobile", "mobile_xl", "ultrawide"],
    "set5": ["desktop", "tablet", "mobile", "mobile_xl", "ultrawide"]
}

RAW_FOLDER = Path("images_raw")
OUTPUT_FOLDER = Path("hero_sets")
ZIP_NAME = "getpawsy_hero_bundle.zip"

# 2. Zorg dat output map bestaat
OUTPUT_FOLDER.mkdir(exist_ok=True)

# 3. Maak de mapstructuur per set
for set_name, folders in sets.items():
    base = OUTPUT_FOLDER / set_name
    base.mkdir(exist_ok=True)
    for f in folders:
        (base / f).mkdir(exist_ok=True)

# 4. Verdeel afbeeldingen automatisch op basis van naam
for file in RAW_FOLDER.iterdir():
    if not file.is_file():
        continue
    fname = file.name.lower()

    for set_name in sets.keys():
        if set_name in fname:  
            # welke categorie?
            if "1920" in fname or "desktop" in fname:
                dest = OUTPUT_FOLDER / set_name / "desktop"
            elif "4x3" in fname or "tablet" in fname:
                dest = OUTPUT_FOLDER / set_name / "tablet"
            elif "1500" in fname or "mobile_" in fname:
                dest = OUTPUT_FOLDER / set_name / "mobile"
            elif "2400" in fname or "xl" in fname:
                dest = OUTPUT_FOLDER / set_name / "mobile_xl"
            elif "3440" in fname or "ultrawide" in fname:
                dest = OUTPUT_FOLDER / set_name / "ultrawide"
            else:
                continue

            os.system(f"cp '{file}' '{dest}/{file.name}'")
            break

# 5. Maak ZIP-bestand
with zipfile.ZipFile(ZIP_NAME, "w", zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(OUTPUT_FOLDER):
        for file in files:
            filepath = os.path.join(root, file)
            zipf.write(filepath, filepath)

print("KLAAR → ZIP staat in de Replit workspace:", ZIP_NAME)
