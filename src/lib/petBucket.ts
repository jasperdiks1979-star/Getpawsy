const norm = (s: string): string =>
  (s || "").toLowerCase().replace(/[^a-z0-9\s\-]/g, " ").replace(/\s+/g, " ").trim();

const has = (t: string, words: string[]): boolean => words.some(w => t.includes(w));

export type PetBucket =
  | "toys" | "feeding" | "travel" | "grooming" | "training" | "beds" | "health"
  | "litter" | "scratchers" | "unknown";

export function inferBucket(input: { title?: string; description?: string; tags?: string[] | string; category?: string; type?: string; }): PetBucket {
  const combined = [input.title, input.description, Array.isArray(input.tags) ? input.tags.join(" ") : input.tags, input.category, input.type].filter(Boolean).join(" ");
  const t = norm(combined);

  if (has(t, ["litter box", "cat litter", "litter", "scoop"])) return "litter";
  if (has(t, ["scratcher", "scratching", "cat tree", "cat tower", "scratch post", "scratching post"])) return "scratchers";

  if (has(t, ["toy", "toys", "ball", "rope", "squeaky", "fetch", "chew toy", "interactive toy", "teaser"])) return "toys";
  if (has(t, ["bowl", "feeder", "slow feeder", "fountain", "water fountain", "kibble", "treat", "treats", "food", "feeding", "catnip"])) return "feeding";
  if (has(t, ["carrier", "car seat", "seat cover", "pet barrier", "car barrier", "travel", "crate", "kennel"])) return "travel";
  if (has(t, ["groom", "grooming", "brush", "deshedding", "nail clipper", "fur", "pet hair", "shampoo"])) return "grooming";
  if (has(t, ["training", "clicker", "muzzle", "anti bark", "bark", "lead training"])) return "training";
  if (has(t, ["bed", "mat", "blanket", "cushion", "orthopedic", "sofa cover"])) return "beds";
  if (has(t, ["flea", "tick", "supplement", "probiotic", "vitamin", "calming", "health"])) return "health";

  return "unknown";
}
