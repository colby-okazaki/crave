export type Cuisine = { id: string; label: string };

/**
 * Every cuisine people can filter by. The id is what we send to the backend
 * (`filters.cuisine`, e.g. "mexican"); the label is what people see.
 * TODO: agree on this list with the backend so every id can actually be searched.
 */
export const ALL_CUISINES: Cuisine[] = [
  { id: "american", label: "American" },
  { id: "bbq", label: "BBQ" },
  { id: "bakery", label: "Bakery" },
  { id: "boba", label: "Boba" },
  { id: "brazilian", label: "Brazilian" },
  { id: "breakfast", label: "Breakfast & Brunch" },
  { id: "burgers", label: "Burgers" },
  { id: "cafe", label: "Cafe" },
  { id: "caribbean", label: "Caribbean" },
  { id: "chinese", label: "Chinese" },
  { id: "dessert", label: "Dessert" },
  { id: "ethiopian", label: "Ethiopian" },
  { id: "filipino", label: "Filipino" },
  { id: "french", label: "French" },
  { id: "greek", label: "Greek" },
  { id: "halal", label: "Halal" },
  { id: "hawaiian", label: "Hawaiian" },
  { id: "indian", label: "Indian" },
  { id: "italian", label: "Italian" },
  { id: "japanese", label: "Japanese" },
  { id: "korean", label: "Korean" },
  { id: "mediterranean", label: "Mediterranean" },
  { id: "mexican", label: "Mexican" },
  { id: "middle_eastern", label: "Middle Eastern" },
  { id: "pizza", label: "Pizza" },
  { id: "ramen", label: "Ramen" },
  { id: "salad", label: "Salad" },
  { id: "sandwiches", label: "Sandwiches" },
  { id: "seafood", label: "Seafood" },
  { id: "spanish", label: "Spanish" },
  { id: "steakhouse", label: "Steakhouse" },
  { id: "sushi", label: "Sushi" },
  { id: "thai", label: "Thai" },
  { id: "turkish", label: "Turkish" },
  { id: "vegan", label: "Vegan" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "vietnamese", label: "Vietnamese" },
];

/** The chips shown before anyone adds more (from Figma). */
export const DEFAULT_CUISINE_IDS = ["mexican", "thai", "pizza", "sushi", "burgers", "indian"];

const BY_ID = new Map(ALL_CUISINES.map((c) => [c.id, c]));

export function cuisineLabel(id: string) {
  return BY_ID.get(id)?.label ?? id;
}
