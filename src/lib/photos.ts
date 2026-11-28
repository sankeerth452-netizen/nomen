import type { StaticImageData } from "next/image";
import bag from "@/assets/photos/bag.jpg";
import dress from "@/assets/photos/dress.jpg";
import empty from "@/assets/photos/empty.jpg";
import hero from "@/assets/photos/hero.jpg";
import jacket from "@/assets/photos/jacket.jpg";
import jeans from "@/assets/photos/jeans.jpg";
import jewellery from "@/assets/photos/jewellery.jpg";
import knit from "@/assets/photos/knit.jpg";
import login from "@/assets/photos/login.jpg";
import pants from "@/assets/photos/pants.jpg";
import shoes from "@/assets/photos/shoes.jpg";
import skirt from "@/assets/photos/skirt.jpg";
import swim from "@/assets/photos/swim.jpg";
import top from "@/assets/photos/top.jpg";
import { categoryForType } from "./vocab/fashion";

// Photography: Burst by Shopify and Pexels (both free for commercial use; credit isn't required but every photo is
// credited on /credits). Imported statically so Next serves them from /_next/static (no login needed) with sizes and
// blur placeholders. The piece photos (dress to jewellery) share one warm, plain-backdrop look and fill the frame.

export type PhotoKey = "dress" | "top" | "skirt" | "pants" | "jeans" | "jacket" | "knit" | "shoes" | "bag" | "jewellery" | "swim" | "hero" | "login" | "empty";
export type Photo = { src: StaticImageData; alt: string; position?: string; title: string; photographer: string; licence: string; url: string };

const burst = (slug: string) => `https://www.shopify.com/stock-photos/photos/${slug}`;
const SRSV = "Burst Some Rights Reserved";
const pexels = (slug: string) => `https://www.pexels.com/photo/${slug}/`;
const PEXELS = "Pexels License";

export const PHOTOS: Record<PhotoKey, Photo> = {
  dress: { src: dress, alt: "Orange linen wrap dress", title: "Person Wearing Orange Dress", photographer: "Thirdman", licence: PEXELS, url: pexels("person-wearing-orange-dress-8053672") },
  top: { src: top, alt: "White shirt against a beige backdrop", position: "50% 35%", title: "A Pretty Woman in White Long Sleeves", photographer: "Arina Krasnikova", licence: PEXELS, url: pexels("a-pretty-woman-in-white-long-sleeves-7752609") },
  skirt: { src: skirt, alt: "Rust-to-white ombre pleated midi skirt", position: "50% 35%", title: "A Person Wearing a Pleated Skirt", photographer: "Maksim Goncharenok", licence: PEXELS, url: pexels("a-person-wearing-a-pleated-skirt-4663319") },
  pants: { src: pants, alt: "Rust tailored trousers with cream loafers", position: "50% 60%", title: "Orange Jacket and Trousers", photographer: "Ron Lach", licence: PEXELS, url: pexels("orange-jacket-and-trousers-10341113") },
  jeans: { src: jeans, alt: "Light-wash ripped jeans with a leather camera bag", title: "Woman in Jeans With a Camera Case", photographer: "Kaboompics", licence: PEXELS, url: pexels("woman-in-jeans-with-a-camera-case-7588015") },
  jacket: { src: jacket, alt: "Pink and sage oversized blazers", position: "50% 40%", title: "Confident Multiethnic Female Models in Stylish Suits", photographer: "Monstera Production", licence: PEXELS, url: pexels("confident-multiethnic-female-models-in-stylish-suits-7691041") },
  knit: { src: knit, alt: "A stack of cream and caramel knit jumpers", title: "Close-up of Colorful Sweaters", photographer: "Nati", licence: PEXELS, url: pexels("close-up-of-colorful-sweaters-14641596") },
  shoes: { src: shoes, alt: "Burgundy patent heels against a beige backdrop", title: "Woman Legs in High Heels", photographer: "José Martin Segura Benites", licence: PEXELS, url: pexels("woman-legs-in-high-heels-26850888") },
  bag: { src: bag, alt: "Beige woven top-handle bag", position: "50% 62%", title: "Photo of a Handbag", photographer: "Macjoy Peñaredondo", licence: PEXELS, url: pexels("photo-of-a-handbag-8006405") },
  jewellery: { src: jewellery, alt: "Large gold hoop earrings", title: "Golden Hoops in Ear", photographer: "The Glorious Studio", licence: PEXELS, url: pexels("golden-hoops-in-ear-18075559") },
  swim: { src: swim, alt: "Mint bikini laid flat with summer things", title: "A Flatlay of Swimwear and Summer Essentials", photographer: "alleksana", licence: PEXELS, url: pexels("a-flatlay-of-swimwear-and-summer-essentials-4271767") },
  hero: { src: hero, alt: "A rail of tops on wooden hangers", title: "Clothing On Retail Rack", photographer: "Sarah Pflug", licence: SRSV, url: burst("clothing-on-retail-rack") },
  login: { src: login, alt: "A hand reaching for black tops on a rail", title: "Hand Reaches For Hanging Sweatshirt", photographer: "Matthew Henry", licence: SRSV, url: burst("hand-reaches-for-hanging-sweatshirt") },
  empty: { src: empty, alt: "A clothing rail in a bright white room", title: "Rack Of Womens Clothing", photographer: "Sarah Pflug", licence: SRSV, url: burst("rack-of-womens-clothing") },
};

/** The piece picker: one photo tile per department. The first noun is the default product type; the rest are offered as chips. */
export type TypeTile = { key: PhotoKey; label: string; nouns: string[] };
export const TYPE_TILES: TypeTile[] = [
  { key: "dress", label: "Dresses", nouns: ["dress"] },
  { key: "top", label: "Tops", nouns: ["top", "tee", "blouse", "shirt", "cami", "bodysuit"] },
  { key: "skirt", label: "Skirts", nouns: ["skirt", "skort"] },
  { key: "pants", label: "Pants", nouns: ["pants", "trousers", "leggings", "joggers"] },
  { key: "jeans", label: "Denim", nouns: ["jeans", "shorts"] },
  { key: "jacket", label: "Jackets", nouns: ["jacket", "coat", "blazer", "puffer", "trench"] },
  { key: "knit", label: "Knitwear", nouns: ["jumper", "cardigan", "sweater", "hoodie"] },
  { key: "swim", label: "Swim", nouns: ["bikini", "swimsuit", "one-piece"] },
  { key: "shoes", label: "Shoes", nouns: ["heels", "boots", "sneakers", "sandals", "flats", "loafers"] },
  { key: "bag", label: "Bags", nouns: ["bag", "tote", "clutch", "backpack"] },
  { key: "jewellery", label: "Jewellery", nouns: ["earrings", "necklace", "ring", "bracelet"] },
];

const BY_CATEGORY: Record<string, PhotoKey> = {
  Dresses: "dress", Tops: "top", Skirts: "skirt", Pants: "pants", "Jeans & Denim": "jeans", Shorts: "jeans",
  "Coats & Jackets": "jacket", "Suits & Blazers": "jacket", Knitwear: "knit", Shoes: "shoes", Bags: "bag",
  Jewellery: "jewellery", Swimwear: "swim", "Jumpsuits & Playsuits": "pants", "Lingerie & Sleepwear": "top", Sets: "top",
};

/** The photo that best stands for a product type ("midi dress" -> the dress photo); the rail photo when unknown. */
export function photoForType(productType: string | null | undefined): Photo {
  const noun = (productType ?? "").toLowerCase().trim().split(/\s+/).pop() ?? "";
  const tile = TYPE_TILES.find((t) => t.nouns.includes(noun));
  return PHOTOS[tile?.key ?? BY_CATEGORY[categoryForType(noun) ?? ""] ?? "hero"];
}

/** Which tile a typed product type belongs to, so the picker stays in sync with the text field. */
export const tileForType = (productType: string) => {
  const noun = productType.toLowerCase().trim().split(/\s+/).pop() ?? "";
  return TYPE_TILES.find((t) => t.nouns.includes(noun) || BY_CATEGORY[categoryForType(noun) ?? ""] === t.key)?.key ?? null;
};
