// Google Merchant Center's rules for the attributes Nomen writes (product data specification, checked Nov 2026).
// Kept in one place so they can be updated when Google changes them; the category list itself is in the database.
export const GOOGLE_RULES = {
  titleMax: 150,
  descriptionMax: 5000,
  highlightsMax: 10,
  highlightChars: 150,
  detailNameChars: 140,
  detailValueChars: 1000,
  colourParts: 3,
  colourChars: 40,
  customLabelChars: 100,
  genders: ["Male", "Female", "Unisex"],
  ageGroups: ["Newborn", "Infant", "Toddler", "Kids", "Adult"],
  sizeTypes: ["Regular", "Petite", "Plus", "Tall", "Big", "Maternity"],
} as const;
