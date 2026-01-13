const { db } = require("./db");

const IS_DEPLOY = process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";

async function seedIfEmpty() {
  if (IS_DEPLOY) {
    console.log("[Seed] Skipping seed in deployment mode - only real products allowed");
    return;
  }
  
  const items = await db.listProducts();
  if (items.length) return;

  console.log("[Seed] DEV MODE: Inserting demo products for testing");
  await db.upsertProducts([
    {
      id: "cj_demo_1",
      title: "Durable Dog Chew Ball",
      price: 19.99,
      image: "/img/demo-dogball.svg",
      description: "Tough chew ball for heavy chewers. Great for training and play.",
      source: "demo"
    },
    {
      id: "cj_demo_2",
      title: "Cozy Calming Pet Bed",
      price: 49.99,
      image: "/img/demo-bed.svg",
      description: "Ultra-soft calming bed for cats & dogs. Perfect for naps and anxiety relief.",
      source: "demo"
    },
    {
      id: "cj_demo_3",
      title: "Interactive Cat Teaser Wand",
      price: 14.99,
      image: "/img/demo-catwand.svg",
      description: "Interactive teaser wand to keep your cat engaged and active.",
      source: "demo"
    }
  ]);
}

module.exports = { seedIfEmpty };
