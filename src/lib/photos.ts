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

// Photography: Burst by Shopify (free for commercial use; credit encouraged, so every photo is credited on /credits).
// Imported statically so Next serves them from /_next/static (no login needed) with sizes and blur placeholders.

export type PhotoKey = "dress" | "top" | "skirt" | "pants" | "jeans" | "jacket" | "knit" | "shoes" | "bag" | "jewellery" | "swim" | "hero" | "login" | "empty";
export type Photo = { src: StaticImageData; alt: string; position?: string; title: string; photographer: string; licence: string; url: string };

const burst = (slug: string) => `https://www.shopify.com/stock-photos/photos/${slug}`;
const SRSV = "Burst Some Rights Reserved";

export const PHOTOS: Record<PhotoKey, Photo> = {
  dress: { src: dress, alt: "Red one-shoulder ruffle dress", title: "Cocktail Dress Off Shoulder", photographer: "Shopify Partners", licence: SRSV, url: burst("cocktail-dress-off-shoulder") },
  top: { src: top, alt: "Black lace blouse", title: "Black Lace Blouse", photographer: "Shopify Partners", licence: SRSV, url: burst("black-lace-blouse") },
  skirt: { src: skirt, alt: "Red pleated midi skirt with a white tee", position: "50% 70%", title: "Woman In White Shirt And Red Skirt Against Cloth Backdrop", photographer: "Samantha Hurley", licence: SRSV, url: burst("woman-in-white-shirt-and-red-skirt-against-cloth-backdrop") },
  pants: { src: pants, alt: "Coral wide-leg pants against a blue wall", position: "50% 60%", title: "Stylish Woman Against Blue", photographer: "Sarah Pflug", licence: SRSV, url: burst("stylish-woman-against-blue") },
  jeans: { src: jeans, alt: "Light-wash high-rise jeans with a grey knit", title: "Torso Of Person On An Apartment Balcony Facing Camera", photographer: "Avelino Calvar Martinez", licence: SRSV, url: burst("torso-of-person-on-an-apartment-balcony-facing-camera") },
  jacket: { src: jacket, alt: "Black leather jacket over a white tee", position: "60% 50%", title: "Close Up Leather Jacket Over Shoulders", photographer: "Jeremy Marasigan", licence: SRSV, url: burst("close-up-leather-jacket-over-shoulders") },
  knit: { src: knit, alt: "Cream ribbed knit jumper", title: "Close Up Showing Detail Of Cream Sweater", photographer: "Jeremy Marasigan", licence: SRSV, url: burst("close-up-showing-detail-of-cream-sweater") },
  shoes: { src: shoes, alt: "Black peep-toe heels beside white flowers", position: "68% 50%", title: "Heels And Flowers", photographer: "Sarah Pflug", licence: SRSV, url: burst("heels-and-flowers") },
  bag: { src: bag, alt: "Light pink saddle bag with a tassel", title: "Light Pink Purse", photographer: "Shopify Partners", licence: SRSV, url: burst("light-pink-purse") },
  jewellery: { src: jewellery, alt: "Statement raffia earring", title: "Ear Close Up With A Light Brown Statement Earring", photographer: "Farah", licence: SRSV, url: burst("ear-close-up-with-a-light-brown-statement-earring") },
  swim: { src: swim, alt: "Black bandeau bikini on coral", title: "Black Bikini Product", photographer: "Sarah Pflug", licence: "Creative Commons (per Burst)", url: burst("black-bikini-product") },
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
