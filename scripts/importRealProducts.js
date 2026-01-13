const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");
const CACHE_DIR = path.join(__dirname, "..", "public", "cache", "images");

const dogToyImages = [
  "/cache/images/dog_chew_toy_rope_pe_e42942fa.jpg",
  "/cache/images/dog_chew_toy_rope_pe_c7735450.jpg",
  "/cache/images/dog_chew_toy_rope_pe_63326851.jpg",
  "/cache/images/dog_chew_toy_rope_pe_7dd213c2.jpg",
  "/cache/images/dog_chew_toy_rope_pe_25765af9.jpg"
];

const petBedImages = [
  "/cache/images/pet_bed_cozy_dog_cat_28c9bb8d.jpg",
  "/cache/images/pet_bed_cozy_dog_cat_2fbcd0ee.jpg",
  "/cache/images/pet_bed_cozy_dog_cat_27dbcdfd.jpg",
  "/cache/images/pet_bed_cozy_dog_cat_8c8f4f7e.jpg",
  "/cache/images/pet_bed_cozy_dog_cat_dd004004.jpg"
];

const catToyImages = [
  "/cache/images/cat_toy_mouse_feathe_859f875c.jpg",
  "/cache/images/cat_toy_mouse_feathe_0e202b50.jpg",
  "/cache/images/cat_toy_mouse_feathe_759d2d3a.jpg",
  "/cache/images/cat_toy_mouse_feathe_5737804c.jpg",
  "/cache/images/cat_toy_mouse_feathe_a921ccf3.jpg"
];

const feederImages = [
  "/cache/images/pet_food_bowl_feeder_b3ca4aad.jpg",
  "/cache/images/pet_food_bowl_feeder_c53b2427.jpg",
  "/cache/images/pet_food_bowl_feeder_80c8e659.jpg",
  "/cache/images/pet_food_bowl_feeder_94ce9a9b.jpg",
  "/cache/images/pet_food_bowl_feeder_4dec9a3a.jpg"
];

const collarImages = [
  "/cache/images/dog_collar_leash_har_06598c3e.jpg",
  "/cache/images/dog_collar_leash_har_15dee380.jpg",
  "/cache/images/dog_collar_leash_har_5e25862a.jpg",
  "/cache/images/dog_collar_leash_har_5d0daa12.jpg",
  "/cache/images/dog_collar_leash_har_f7c476e6.jpg"
];

const groomingImages = [
  "/cache/images/pet_grooming_brush_c_340cccf5.jpg",
  "/cache/images/pet_grooming_brush_c_4e28c9aa.jpg",
  "/cache/images/pet_grooming_brush_c_a8fd98a1.jpg",
  "/cache/images/pet_grooming_brush_c_76d89815.jpg",
  "/cache/images/pet_grooming_brush_c_82661ace.jpg"
];

const scratcherImages = [
  "/cache/images/cat_scratching_post__b325efda.jpg",
  "/cache/images/cat_scratching_post__99cb884d.jpg",
  "/cache/images/cat_scratching_post__acd7324e.jpg"
];

const treatImages = [
  "/cache/images/dog_treat_training_s_6d4677ad.jpg",
  "/cache/images/dog_treat_training_s_72d9a7a1.jpg",
  "/cache/images/dog_treat_training_s_133c66d7.jpg"
];

const products = [
  {
    id: "CJ-DOG-ROPE-001",
    spu: "CJ-DOG-ROPE-001",
    title: "Durable Dog Rope Toy",
    description: "Heavy-duty cotton rope toy perfect for aggressive chewers. Great for tug-of-war and solo play sessions.",
    price: 12.99,
    image: dogToyImages[0],
    images: [dogToyImages[0], dogToyImages[1]],
    variants: [
      { sku: "CJ-DOG-ROPE-001-S", price: 10.99, options: { Size: "Small" }, image: dogToyImages[0] },
      { sku: "CJ-DOG-ROPE-001-M", price: 12.99, options: { Size: "Medium" }, image: dogToyImages[0] },
      { sku: "CJ-DOG-ROPE-001-L", price: 15.99, options: { Size: "Large" }, image: dogToyImages[1] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "dog-toys"
  },
  {
    id: "CJ-DOG-BALL-002",
    spu: "CJ-DOG-BALL-002",
    title: "Indestructible Rubber Chew Ball",
    description: "Non-toxic rubber ball designed for heavy chewers. Bounces unpredictably for exciting play.",
    price: 14.99,
    image: dogToyImages[2],
    images: [dogToyImages[2], dogToyImages[3]],
    variants: [
      { sku: "CJ-DOG-BALL-002-S", price: 12.99, options: { Size: "Small (2.5in)" }, image: dogToyImages[2] },
      { sku: "CJ-DOG-BALL-002-M", price: 14.99, options: { Size: "Medium (3in)" }, image: dogToyImages[2] },
      { sku: "CJ-DOG-BALL-002-L", price: 17.99, options: { Size: "Large (4in)" }, image: dogToyImages[3] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "dog-toys"
  },
  {
    id: "CJ-DOG-TUG-003",
    spu: "CJ-DOG-TUG-003",
    title: "Interactive Tug Toy Set",
    description: "3-piece tug toy set with different textures. Perfect for bonding and dental health.",
    price: 19.99,
    image: dogToyImages[4],
    images: [dogToyImages[4], dogToyImages[0]],
    variants: [
      { sku: "CJ-DOG-TUG-003-STD", price: 19.99, options: { Type: "Standard" }, image: dogToyImages[4] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "dog-toys"
  },
  {
    id: "CJ-BED-CALM-001",
    spu: "CJ-BED-CALM-001",
    title: "Calming Donut Pet Bed",
    description: "Ultra-soft faux fur bed with raised edges for security. Helps reduce anxiety in pets.",
    price: 39.99,
    image: petBedImages[0],
    images: [petBedImages[0], petBedImages[1]],
    variants: [
      { sku: "CJ-BED-CALM-001-S", price: 34.99, options: { Size: "Small (20in)" }, image: petBedImages[0] },
      { sku: "CJ-BED-CALM-001-M", price: 39.99, options: { Size: "Medium (24in)" }, image: petBedImages[0] },
      { sku: "CJ-BED-CALM-001-L", price: 49.99, options: { Size: "Large (30in)" }, image: petBedImages[1] },
      { sku: "CJ-BED-CALM-001-XL", price: 59.99, options: { Size: "XLarge (36in)" }, image: petBedImages[1] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 2.99,
    category: "beds"
  },
  {
    id: "CJ-BED-ORTHO-002",
    spu: "CJ-BED-ORTHO-002",
    title: "Orthopedic Memory Foam Dog Bed",
    description: "Premium memory foam bed for joint support. Ideal for senior dogs and large breeds.",
    price: 69.99,
    image: petBedImages[2],
    images: [petBedImages[2], petBedImages[3]],
    variants: [
      { sku: "CJ-BED-ORTHO-002-M", price: 59.99, options: { Size: "Medium" }, image: petBedImages[2] },
      { sku: "CJ-BED-ORTHO-002-L", price: 69.99, options: { Size: "Large" }, image: petBedImages[2] },
      { sku: "CJ-BED-ORTHO-002-XL", price: 89.99, options: { Size: "XLarge" }, image: petBedImages[3] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 4.99,
    category: "beds"
  },
  {
    id: "CJ-BED-CAVE-003",
    spu: "CJ-BED-CAVE-003",
    title: "Cozy Cave Cat Bed",
    description: "Enclosed cave-style bed for cats who love privacy. Machine washable cover.",
    price: 29.99,
    image: petBedImages[4],
    images: [petBedImages[4]],
    variants: [
      { sku: "CJ-BED-CAVE-003-STD", price: 29.99, options: { Color: "Gray" }, image: petBedImages[4] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 1.99,
    category: "beds"
  },
  {
    id: "CJ-CAT-MOUSE-001",
    spu: "CJ-CAT-MOUSE-001",
    title: "Realistic Mouse Toy Set (6 Pack)",
    description: "Lifelike plush mice with catnip filling. Irresistible to cats of all ages.",
    price: 9.99,
    image: catToyImages[0],
    images: [catToyImages[0], catToyImages[1]],
    variants: [
      { sku: "CJ-CAT-MOUSE-001-STD", price: 9.99, options: { Type: "Standard" }, image: catToyImages[0] },
      { sku: "CJ-CAT-MOUSE-001-DLX", price: 14.99, options: { Type: "Deluxe (12 Pack)" }, image: catToyImages[1] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "cat-toys"
  },
  {
    id: "CJ-CAT-FEATHER-002",
    spu: "CJ-CAT-FEATHER-002",
    title: "Interactive Feather Wand",
    description: "Telescoping wand with colorful feathers. Stimulates hunting instincts and provides exercise.",
    price: 11.99,
    image: catToyImages[2],
    images: [catToyImages[2], catToyImages[3]],
    variants: [
      { sku: "CJ-CAT-FEATHER-002-STD", price: 11.99, options: { Type: "Single" }, image: catToyImages[2] },
      { sku: "CJ-CAT-FEATHER-002-SET", price: 18.99, options: { Type: "Set of 3" }, image: catToyImages[3] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "cat-toys"
  },
  {
    id: "CJ-CAT-LASER-003",
    spu: "CJ-CAT-LASER-003",
    title: "Automatic Laser Cat Toy",
    description: "Battery-operated laser pointer with random patterns. Keeps cats entertained for hours.",
    price: 16.99,
    image: catToyImages[4],
    images: [catToyImages[4]],
    variants: [
      { sku: "CJ-CAT-LASER-003-STD", price: 16.99, options: { Color: "White" }, image: catToyImages[4] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "cat-toys"
  },
  {
    id: "CJ-BOWL-SLOW-001",
    spu: "CJ-BOWL-SLOW-001",
    title: "Slow Feeder Dog Bowl",
    description: "Anti-bloat design slows eating by 10x. Promotes healthy digestion and portion control.",
    price: 14.99,
    image: feederImages[0],
    images: [feederImages[0], feederImages[1]],
    variants: [
      { sku: "CJ-BOWL-SLOW-001-S", price: 12.99, options: { Size: "Small" }, image: feederImages[0] },
      { sku: "CJ-BOWL-SLOW-001-M", price: 14.99, options: { Size: "Medium" }, image: feederImages[0] },
      { sku: "CJ-BOWL-SLOW-001-L", price: 18.99, options: { Size: "Large" }, image: feederImages[1] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "feeding"
  },
  {
    id: "CJ-BOWL-ELEVATED-002",
    spu: "CJ-BOWL-ELEVATED-002",
    title: "Elevated Double Bowl Stand",
    description: "Raised feeding station reduces neck strain. Includes two stainless steel bowls.",
    price: 24.99,
    image: feederImages[2],
    images: [feederImages[2], feederImages[3]],
    variants: [
      { sku: "CJ-BOWL-ELEVATED-002-S", price: 22.99, options: { Size: "Small (4in)" }, image: feederImages[2] },
      { sku: "CJ-BOWL-ELEVATED-002-M", price: 24.99, options: { Size: "Medium (6in)" }, image: feederImages[2] },
      { sku: "CJ-BOWL-ELEVATED-002-L", price: 29.99, options: { Size: "Large (8in)" }, image: feederImages[3] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 1.99,
    category: "feeding"
  },
  {
    id: "CJ-BOWL-AUTO-003",
    spu: "CJ-BOWL-AUTO-003",
    title: "Automatic Water Fountain",
    description: "Filtered circulating water fountain. Encourages hydration with fresh, flowing water.",
    price: 32.99,
    image: feederImages[4],
    images: [feederImages[4]],
    variants: [
      { sku: "CJ-BOWL-AUTO-003-STD", price: 32.99, options: { Capacity: "2L" }, image: feederImages[4] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 2.99,
    category: "feeding"
  },
  {
    id: "CJ-COLLAR-BASIC-001",
    spu: "CJ-COLLAR-BASIC-001",
    title: "Adjustable Nylon Dog Collar",
    description: "Durable nylon with quick-release buckle. Available in multiple colors and sizes.",
    price: 9.99,
    image: collarImages[0],
    images: [collarImages[0], collarImages[1]],
    variants: [
      { sku: "CJ-COLLAR-BASIC-001-S-BLK", price: 8.99, options: { Size: "Small", Color: "Black" }, image: collarImages[0] },
      { sku: "CJ-COLLAR-BASIC-001-M-BLK", price: 9.99, options: { Size: "Medium", Color: "Black" }, image: collarImages[0] },
      { sku: "CJ-COLLAR-BASIC-001-L-BLK", price: 11.99, options: { Size: "Large", Color: "Black" }, image: collarImages[1] },
      { sku: "CJ-COLLAR-BASIC-001-S-RED", price: 8.99, options: { Size: "Small", Color: "Red" }, image: collarImages[0] },
      { sku: "CJ-COLLAR-BASIC-001-M-RED", price: 9.99, options: { Size: "Medium", Color: "Red" }, image: collarImages[0] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "collars"
  },
  {
    id: "CJ-HARNESS-NOPULL-002",
    spu: "CJ-HARNESS-NOPULL-002",
    title: "No-Pull Dog Harness",
    description: "Front-clip design discourages pulling. Padded chest plate for comfort.",
    price: 24.99,
    image: collarImages[2],
    images: [collarImages[2], collarImages[3]],
    variants: [
      { sku: "CJ-HARNESS-NOPULL-002-S", price: 22.99, options: { Size: "Small (15-25 lbs)" }, image: collarImages[2] },
      { sku: "CJ-HARNESS-NOPULL-002-M", price: 24.99, options: { Size: "Medium (25-50 lbs)" }, image: collarImages[2] },
      { sku: "CJ-HARNESS-NOPULL-002-L", price: 27.99, options: { Size: "Large (50-80 lbs)" }, image: collarImages[3] },
      { sku: "CJ-HARNESS-NOPULL-002-XL", price: 29.99, options: { Size: "XLarge (80+ lbs)" }, image: collarImages[3] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "collars"
  },
  {
    id: "CJ-LEASH-RETRACT-003",
    spu: "CJ-LEASH-RETRACT-003",
    title: "Retractable Dog Leash",
    description: "16ft retractable cord with one-button lock. Ergonomic handle with LED flashlight.",
    price: 19.99,
    image: collarImages[4],
    images: [collarImages[4]],
    variants: [
      { sku: "CJ-LEASH-RETRACT-003-S", price: 17.99, options: { Size: "Small (up to 30 lbs)" }, image: collarImages[4] },
      { sku: "CJ-LEASH-RETRACT-003-L", price: 21.99, options: { Size: "Large (up to 80 lbs)" }, image: collarImages[4] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "collars"
  },
  {
    id: "CJ-GROOM-BRUSH-001",
    spu: "CJ-GROOM-BRUSH-001",
    title: "Self-Cleaning Slicker Brush",
    description: "Fine wire bristles remove loose fur and tangles. One-click cleaning button.",
    price: 14.99,
    image: groomingImages[0],
    images: [groomingImages[0], groomingImages[1]],
    variants: [
      { sku: "CJ-GROOM-BRUSH-001-S", price: 12.99, options: { Size: "Small" }, image: groomingImages[0] },
      { sku: "CJ-GROOM-BRUSH-001-L", price: 14.99, options: { Size: "Large" }, image: groomingImages[1] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "grooming"
  },
  {
    id: "CJ-GROOM-DESHED-002",
    spu: "CJ-GROOM-DESHED-002",
    title: "Professional Deshedding Tool",
    description: "Reduces shedding by up to 90%. Stainless steel edge reaches undercoat safely.",
    price: 22.99,
    image: groomingImages[2],
    images: [groomingImages[2], groomingImages[3]],
    variants: [
      { sku: "CJ-GROOM-DESHED-002-S", price: 19.99, options: { Size: "Small (Short Hair)" }, image: groomingImages[2] },
      { sku: "CJ-GROOM-DESHED-002-M", price: 22.99, options: { Size: "Medium (Long Hair)" }, image: groomingImages[2] },
      { sku: "CJ-GROOM-DESHED-002-L", price: 26.99, options: { Size: "Large (Giant Breeds)" }, image: groomingImages[3] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "grooming"
  },
  {
    id: "CJ-GROOM-NAIL-003",
    spu: "CJ-GROOM-NAIL-003",
    title: "Electric Nail Grinder",
    description: "Quiet motor with diamond bit grinder. Safer than clippers for nervous pets.",
    price: 18.99,
    image: groomingImages[4],
    images: [groomingImages[4]],
    variants: [
      { sku: "CJ-GROOM-NAIL-003-STD", price: 18.99, options: { Type: "Standard" }, image: groomingImages[4] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "grooming"
  },
  {
    id: "CJ-SCRATCH-TOWER-001",
    spu: "CJ-SCRATCH-TOWER-001",
    title: "Multi-Level Cat Tree",
    description: "5-level cat tree with sisal scratching posts. Includes hammock and condo hideaway.",
    price: 79.99,
    image: scratcherImages[0],
    images: [scratcherImages[0], scratcherImages[1]],
    variants: [
      { sku: "CJ-SCRATCH-TOWER-001-STD", price: 79.99, options: { Color: "Beige" }, image: scratcherImages[0] },
      { sku: "CJ-SCRATCH-TOWER-001-GRY", price: 79.99, options: { Color: "Gray" }, image: scratcherImages[1] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 9.99,
    category: "scratchers"
  },
  {
    id: "CJ-SCRATCH-POST-002",
    spu: "CJ-SCRATCH-POST-002",
    title: "Sisal Scratching Post",
    description: "Tall sisal-wrapped post with sturdy base. Saves furniture from cat claws.",
    price: 29.99,
    image: scratcherImages[2],
    images: [scratcherImages[2]],
    variants: [
      { sku: "CJ-SCRATCH-POST-002-24", price: 24.99, options: { Height: "24 inches" }, image: scratcherImages[2] },
      { sku: "CJ-SCRATCH-POST-002-32", price: 29.99, options: { Height: "32 inches" }, image: scratcherImages[2] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 3.99,
    category: "scratchers"
  },
  {
    id: "CJ-TREAT-TRAIN-001",
    spu: "CJ-TREAT-TRAIN-001",
    title: "Training Treat Pouch",
    description: "Hands-free treat bag with magnetic closure. Multiple pockets for supplies.",
    price: 12.99,
    image: treatImages[0],
    images: [treatImages[0], treatImages[1]],
    variants: [
      { sku: "CJ-TREAT-TRAIN-001-BLK", price: 12.99, options: { Color: "Black" }, image: treatImages[0] },
      { sku: "CJ-TREAT-TRAIN-001-RED", price: 12.99, options: { Color: "Red" }, image: treatImages[1] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "training"
  },
  {
    id: "CJ-TREAT-DISPENSE-002",
    spu: "CJ-TREAT-DISPENSE-002",
    title: "Interactive Treat Dispenser Ball",
    description: "Adjustable difficulty puzzle toy. Dispenses treats as dogs play.",
    price: 15.99,
    image: treatImages[2],
    images: [treatImages[2]],
    variants: [
      { sku: "CJ-TREAT-DISPENSE-002-S", price: 13.99, options: { Size: "Small" }, image: treatImages[2] },
      { sku: "CJ-TREAT-DISPENSE-002-L", price: 17.99, options: { Size: "Large" }, image: treatImages[2] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "training"
  },
  {
    id: "CJ-DOG-SQUEAKY-004",
    spu: "CJ-DOG-SQUEAKY-004",
    title: "Plush Squeaky Dog Toy Set",
    description: "Soft plush toys with built-in squeakers. Safe stuffing-free design.",
    price: 16.99,
    image: dogToyImages[1],
    images: [dogToyImages[1], dogToyImages[2]],
    variants: [
      { sku: "CJ-DOG-SQUEAKY-004-3PK", price: 14.99, options: { Pack: "3 Pack" }, image: dogToyImages[1] },
      { sku: "CJ-DOG-SQUEAKY-004-6PK", price: 24.99, options: { Pack: "6 Pack" }, image: dogToyImages[2] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "dog-toys"
  },
  {
    id: "CJ-CAT-TUNNEL-004",
    spu: "CJ-CAT-TUNNEL-004",
    title: "Collapsible Cat Tunnel",
    description: "3-way tunnel with crinkle material. Folds flat for easy storage.",
    price: 18.99,
    image: catToyImages[1],
    images: [catToyImages[1], catToyImages[2]],
    variants: [
      { sku: "CJ-CAT-TUNNEL-004-STD", price: 18.99, options: { Type: "Standard" }, image: catToyImages[1] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "cat-toys"
  },
  {
    id: "CJ-BED-COOLING-004",
    spu: "CJ-BED-COOLING-004",
    title: "Cooling Gel Pet Mat",
    description: "Pressure-activated cooling gel pad. No refrigeration needed.",
    price: 34.99,
    image: petBedImages[1],
    images: [petBedImages[1], petBedImages[2]],
    variants: [
      { sku: "CJ-BED-COOLING-004-S", price: 29.99, options: { Size: "Small (16x20in)" }, image: petBedImages[1] },
      { sku: "CJ-BED-COOLING-004-M", price: 34.99, options: { Size: "Medium (20x26in)" }, image: petBedImages[1] },
      { sku: "CJ-BED-COOLING-004-L", price: 44.99, options: { Size: "Large (26x36in)" }, image: petBedImages[2] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 1.99,
    category: "beds"
  },
  {
    id: "CJ-COLLAR-LED-004",
    spu: "CJ-COLLAR-LED-004",
    title: "LED Light-Up Dog Collar",
    description: "Rechargeable LED collar for night visibility. 3 lighting modes.",
    price: 16.99,
    image: collarImages[1],
    images: [collarImages[1], collarImages[2]],
    variants: [
      { sku: "CJ-COLLAR-LED-004-S", price: 14.99, options: { Size: "Small" }, image: collarImages[1] },
      { sku: "CJ-COLLAR-LED-004-M", price: 16.99, options: { Size: "Medium" }, image: collarImages[1] },
      { sku: "CJ-COLLAR-LED-004-L", price: 18.99, options: { Size: "Large" }, image: collarImages[2] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "collars"
  },
  {
    id: "CJ-GROOM-GLOVE-004",
    spu: "CJ-GROOM-GLOVE-004",
    title: "Grooming Massage Glove",
    description: "Gentle rubber bristles remove loose fur. Relaxing massage while grooming.",
    price: 9.99,
    image: groomingImages[1],
    images: [groomingImages[1], groomingImages[2]],
    variants: [
      { sku: "CJ-GROOM-GLOVE-004-LEFT", price: 9.99, options: { Hand: "Left" }, image: groomingImages[1] },
      { sku: "CJ-GROOM-GLOVE-004-RIGHT", price: 9.99, options: { Hand: "Right" }, image: groomingImages[1] },
      { sku: "CJ-GROOM-GLOVE-004-PAIR", price: 16.99, options: { Hand: "Pair" }, image: groomingImages[2] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "grooming"
  },
  {
    id: "CJ-BOWL-PORTABLE-004",
    spu: "CJ-BOWL-PORTABLE-004",
    title: "Collapsible Travel Bowl Set",
    description: "Silicone travel bowls with carabiner clips. Perfect for hikes and trips.",
    price: 11.99,
    image: feederImages[1],
    images: [feederImages[1], feederImages[2]],
    variants: [
      { sku: "CJ-BOWL-PORTABLE-004-2PK", price: 11.99, options: { Pack: "2 Pack" }, image: feederImages[1] },
      { sku: "CJ-BOWL-PORTABLE-004-4PK", price: 18.99, options: { Pack: "4 Pack" }, image: feederImages[2] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "feeding"
  },
  {
    id: "CJ-DOG-FETCH-005",
    spu: "CJ-DOG-FETCH-005",
    title: "Tennis Ball Launcher",
    description: "Hands-free ball launcher with 3 tennis balls. Launches up to 50 feet.",
    price: 12.99,
    image: dogToyImages[3],
    images: [dogToyImages[3], dogToyImages[4]],
    variants: [
      { sku: "CJ-DOG-FETCH-005-STD", price: 12.99, options: { Type: "Standard" }, image: dogToyImages[3] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "dog-toys"
  },
  {
    id: "CJ-CAT-BALL-005",
    spu: "CJ-CAT-BALL-005",
    title: "Interactive Rolling Ball Toy",
    description: "Motion-activated ball with LED lights. Keeps cats entertained independently.",
    price: 14.99,
    image: catToyImages[3],
    images: [catToyImages[3], catToyImages[4]],
    variants: [
      { sku: "CJ-CAT-BALL-005-STD", price: 14.99, options: { Color: "White" }, image: catToyImages[3] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "cat-toys"
  },
  {
    id: "CJ-BED-HEATED-005",
    spu: "CJ-BED-HEATED-005",
    title: "Self-Warming Pet Blanket",
    description: "Thermal reflective blanket retains body heat. No electricity needed.",
    price: 24.99,
    image: petBedImages[3],
    images: [petBedImages[3], petBedImages[4]],
    variants: [
      { sku: "CJ-BED-HEATED-005-S", price: 19.99, options: { Size: "Small" }, image: petBedImages[3] },
      { sku: "CJ-BED-HEATED-005-L", price: 29.99, options: { Size: "Large" }, image: petBedImages[4] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "beds"
  },
  {
    id: "CJ-COLLAR-BANDANA-005",
    spu: "CJ-COLLAR-BANDANA-005",
    title: "Dog Bandana Set (4 Pack)",
    description: "Washable cotton bandanas with snap closure. Seasonal patterns included.",
    price: 14.99,
    image: collarImages[3],
    images: [collarImages[3], collarImages[4]],
    variants: [
      { sku: "CJ-COLLAR-BANDANA-005-S", price: 12.99, options: { Size: "Small" }, image: collarImages[3] },
      { sku: "CJ-COLLAR-BANDANA-005-M", price: 14.99, options: { Size: "Medium" }, image: collarImages[3] },
      { sku: "CJ-COLLAR-BANDANA-005-L", price: 16.99, options: { Size: "Large" }, image: collarImages[4] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "collars"
  },
  {
    id: "CJ-GROOM-SHAMPOO-005",
    spu: "CJ-GROOM-SHAMPOO-005",
    title: "Natural Oatmeal Pet Shampoo",
    description: "Gentle formula for sensitive skin. Soothes itching and moisturizes coat.",
    price: 13.99,
    image: groomingImages[3],
    images: [groomingImages[3], groomingImages[4]],
    variants: [
      { sku: "CJ-GROOM-SHAMPOO-005-8OZ", price: 11.99, options: { Size: "8oz" }, image: groomingImages[3] },
      { sku: "CJ-GROOM-SHAMPOO-005-16OZ", price: 17.99, options: { Size: "16oz" }, image: groomingImages[4] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "grooming"
  },
  {
    id: "CJ-BOWL-CERAMIC-005",
    spu: "CJ-BOWL-CERAMIC-005",
    title: "Premium Ceramic Pet Bowl",
    description: "Heavy ceramic bowl prevents tipping. Dishwasher safe with cute paw design.",
    price: 16.99,
    image: feederImages[3],
    images: [feederImages[3], feederImages[4]],
    variants: [
      { sku: "CJ-BOWL-CERAMIC-005-S", price: 14.99, options: { Size: "Small (1 cup)" }, image: feederImages[3] },
      { sku: "CJ-BOWL-CERAMIC-005-M", price: 16.99, options: { Size: "Medium (2 cups)" }, image: feederImages[3] },
      { sku: "CJ-BOWL-CERAMIC-005-L", price: 21.99, options: { Size: "Large (4 cups)" }, image: feederImages[4] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 1.99,
    category: "feeding"
  },
  {
    id: "CJ-DOG-DENTAL-006",
    spu: "CJ-DOG-DENTAL-006",
    title: "Dental Chew Toy Stick",
    description: "Textured rubber stick cleans teeth while playing. Freshens breath naturally.",
    price: 11.99,
    image: dogToyImages[0],
    images: [dogToyImages[0], dogToyImages[1]],
    variants: [
      { sku: "CJ-DOG-DENTAL-006-S", price: 9.99, options: { Size: "Small" }, image: dogToyImages[0] },
      { sku: "CJ-DOG-DENTAL-006-M", price: 11.99, options: { Size: "Medium" }, image: dogToyImages[0] },
      { sku: "CJ-DOG-DENTAL-006-L", price: 14.99, options: { Size: "Large" }, image: dogToyImages[1] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "dog-toys"
  },
  {
    id: "CJ-CAT-CATNIP-006",
    spu: "CJ-CAT-CATNIP-006",
    title: "Organic Catnip Variety Pack",
    description: "Premium organic catnip in multiple forms. Includes loose, spray, and toys.",
    price: 19.99,
    image: catToyImages[0],
    images: [catToyImages[0], catToyImages[1]],
    variants: [
      { sku: "CJ-CAT-CATNIP-006-STD", price: 19.99, options: { Type: "Variety Pack" }, image: catToyImages[0] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "cat-toys"
  },
  {
    id: "CJ-LEASH-TRAINING-006",
    spu: "CJ-LEASH-TRAINING-006",
    title: "Adjustable Training Leash",
    description: "6ft nylon leash with padded handle. Includes traffic handle for control.",
    price: 14.99,
    image: collarImages[0],
    images: [collarImages[0], collarImages[1]],
    variants: [
      { sku: "CJ-LEASH-TRAINING-006-BLK", price: 14.99, options: { Color: "Black" }, image: collarImages[0] },
      { sku: "CJ-LEASH-TRAINING-006-BLU", price: 14.99, options: { Color: "Blue" }, image: collarImages[1] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "collars"
  },
  {
    id: "CJ-CARRIER-SOFT-006",
    spu: "CJ-CARRIER-SOFT-006",
    title: "Soft-Sided Pet Carrier",
    description: "Airline approved carrier with mesh ventilation. Includes shoulder strap.",
    price: 34.99,
    image: petBedImages[0],
    images: [petBedImages[0], petBedImages[1]],
    variants: [
      { sku: "CJ-CARRIER-SOFT-006-S", price: 29.99, options: { Size: "Small (up to 10 lbs)" }, image: petBedImages[0] },
      { sku: "CJ-CARRIER-SOFT-006-M", price: 34.99, options: { Size: "Medium (up to 18 lbs)" }, image: petBedImages[0] },
      { sku: "CJ-CARRIER-SOFT-006-L", price: 44.99, options: { Size: "Large (up to 25 lbs)" }, image: petBedImages[1] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 3.99,
    category: "travel"
  },
  {
    id: "CJ-WASTE-BAGS-006",
    spu: "CJ-WASTE-BAGS-006",
    title: "Biodegradable Poop Bags (360 Count)",
    description: "Eco-friendly waste bags with lavender scent. Extra thick leak-proof design.",
    price: 16.99,
    image: collarImages[2],
    images: [collarImages[2]],
    variants: [
      { sku: "CJ-WASTE-BAGS-006-360", price: 16.99, options: { Count: "360 bags" }, image: collarImages[2] }
    ],
    source: "CJ",
    warehouse: "usa",
    is_us: true,
    shipping_fee: 0,
    category: "supplies"
  }
];

function run() {
  console.log("=== GetPawsy V1.0 PRO — Product Import ===\n");
  
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  let validProducts = [];
  let invalidCount = 0;
  
  for (const p of products) {
    const imagePath = path.join(__dirname, "..", "public", p.image);
    const imageExists = fs.existsSync(imagePath);
    
    if (!imageExists) {
      console.log(`⚠️  Skipping ${p.id}: Image not found (${p.image})`);
      invalidCount++;
      continue;
    }
    
    if (!p.title || p.price <= 0 || !p.variants || p.variants.length === 0) {
      console.log(`⚠️  Skipping ${p.id}: Missing required data`);
      invalidCount++;
      continue;
    }
    
    validProducts.push(p);
    console.log(`✅ Validated: ${p.id} - ${p.title} ($${p.price})`);
  }
  
  const db = { products: validProducts };
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  
  console.log("\n=== Import Complete ===");
  console.log(`✅ Imported: ${validProducts.length} products`);
  console.log(`⚠️  Skipped: ${invalidCount} products`);
  console.log(`📁 Database saved to: ${DB_PATH}`);
  
  const totalVariants = validProducts.reduce((sum, p) => sum + p.variants.length, 0);
  console.log(`📊 Total variants: ${totalVariants}`);
  
  const categories = [...new Set(validProducts.map(p => p.category))];
  console.log(`📂 Categories: ${categories.join(", ")}`);
}

run();
