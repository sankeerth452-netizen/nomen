// The right product data for each test product, labelled by hand from what its page states (colour, fabric, type),
// before any of Nomen's answers were seen. Only these facts live here, never Sportsgirl's copy.
//
//   category  Google category IDs that are right for it (see src/lib/sheet/catalog.ts for the names)
//   colour    accepted Google colour values: `first` for the main colour, `ok` for any colour after it ("Pink/Green")
//   material  the same for material, main fibre first. `none: true` also accepts no value at all
//   pattern   accepted pattern values, only where the buyer gave a pattern
//   gender, ageGroup  Google's values (Sportsgirl is women's: Female, Adult)
// A label of null for colour or material means nothing was stated, so nothing should be sent.

const v = (first, also = "") => ({ first: first.split("|"), ok: [...first.split("|"), ...also.split("|").filter(Boolean)] });
const orNone = (x) => ({ ...x, none: true });
const DENIM = v("cotton|denim", "cotton|denim");

const women = { gender: ["Female"], ageGroup: ["Adult"] };
const L = (category, colour, material, extra = {}) => ({ category, colour, material, ...women, ...extra });

export const LABELS = {
  "dresses-086362": L([2271], v("pink"), DENIM),
  "dresses-085953": L([2271], v("blue|cornflower blue", "white"), v("viscose", "cotton|lace")),
  "dresses-085951": L([2271], v("brown|espresso"), v("viscose", "nylon")),
  "dresses-085558": L([2271], null, v("viscose", "linen"), { pattern: ["floral"] }),
  "dresses-085940": L([2271], v("brown|chocolate", "cream|white|ecru"), v("cotton")),
  "tops-085923": L([212], v("brown|chocolate"), v("cotton", "lace")),
  "tops-085921": L([212], null, v("cotton"), { pattern: ["check", "checked", "gingham", "plaid"] }),
  "tops-085539": L([212], v("cream"), v("cotton")),
  "tops-085936": L([212], orNone(v("multicolour")), v("cotton"), { pattern: ["floral"] }),
  "tops-085931": L([212], orNone(v("red|pink|multicolour", "red|pink|multicolour")), v("cotton", "viscose"), { pattern: ["print", "printed", "abstract", "floral"] }),
  "tops-085299": L([212], null, v("viscose", "linen"), { pattern: ["floral"] }),
  "tops-079908": L([212], v("pink|red", "pink|red"), v("linen", "cotton")),
  "tops-085543": L([212], v("cream", "lilac|purple"), v("cotton", "lace")),
  "tops-084757": L([212], null, v("viscose", "linen"), { pattern: ["abstract", "print", "printed"] }),
  "pants-079172": L([204], v("brown|dark chocolate"), v("linen", "viscose")),
  "pants-085471": L([204], v("black"), v("viscose", "cotton|linen")),
  "pants-085974": L([204], null, v("viscose", "linen"), { pattern: ["striped", "stripe", "stripes"] }),
  "pants-085245": L([204], v("blue|blues"), v("viscose")),
  "pants-084761": L([204], null, v("viscose", "linen"), { pattern: ["abstract", "print", "printed"] }),
  "shorts-085040": L([207], v("blue|ice blue"), DENIM),
  "shorts-085038": L([207], v("black"), v("cotton|viscose", "cotton|viscose")),
  "shorts-085039": L([207], v("blue|classic blue", "indigo"), DENIM),
  "shorts-085895": L([207], v("blue|indigo"), DENIM),
  "shorts-085606": L([207], v("blue|light blue"), DENIM),
  // "Speckle vest" never says knit, so an outer vest (1831) is a fair reading; a crochet vest is a top.
  "knitwear-aiden-speckle-vest": L([212, 1831], null, v("cotton", "rayon|viscose")),
  "knitwear-082703": L([212], v("black"), v("cotton", "viscose|knit")),
  "knitwear-086007": L([212], v("pink|green|multicolour", "pink|green|multicolour"), v("cotton", "acrylic|crochet")),
  "knitwear-082705": L([212], v("yellow|lemon"), v("polyester", "knit")),
  "knitwear-085058": L([212], v("pink"), v("polyester|recycled polyester", "acrylic|elastane|lace|knit")),
  "jackets-083480": L([5598, 212], v("blue"), v("polyester|recycled polyester", "polyester|viscose")),
  "bags-084078": L([3032], v("blue"), v("pu|polyurethane|faux leather")),
  "bags-085044": L([3032], v("silver"), v("polyester|sequin", "polyester|pet|polyurethane|pu|sequin")),
  // "Matcha ombre" is the shade's name; the page says pink and green.
  "bags-084071": L([103], v("pink|green|multicolour", "pink|green|multicolour"), v("cotton", "polyester")),
  "bags-084975": L([3032], v("cream|bone|beige|white"), v("polyurethane|pu|faux leather")),
  // "Hibiscus and frangipani" is a print, not a colour. The fabric is polyester; "nylon" is in the name.
  "bags-085352": L([3032], orNone(v("multicolour")), v("polyester|nylon", "polyester|nylon")),
  "jewellery-085338": L([196], v("pink|multicolour", "pink|multicolour"), orNone(v("bead|beads|beaded"))),
  "jewellery-085735": L([196], orNone(v("multicolour")), orNone(v("bead|beads|beaded"))),
  "jewellery-085510": L([196], v("gold", "beige|cream"), orNone(v("bead|beads|beaded"))),
  // A gold finish is not gold: no material was stated.
  "jewellery-085747": L([194, 6463], v("gold", "multicolour"), null),
  "jewellery-085665": L([196, 192], v("gold"), orNone(v("gold plated|gold-plated|plated"))),
  "edge-strappy-trap": L([2271], v("white"), v("satin")),
  // Mesh is only on the sleeves, so it isn't the dress's material.
  "edge-mesh-sleeves-trap": L([2271], v("black"), null),
  // Children's pieces: the name must say who it's for, and Google's age group must follow.
  "edge-girls-dress": L([2271], v("cream"), v("cotton"), { gender: ["Female"], ageGroup: ["Kids"] }),
  "edge-boys-shorts": L([207], v("navy|blue"), v("cotton"), { gender: ["Male"], ageGroup: ["Kids"] }),
  "edge-toddler-dress": L([5424], v("pink"), v("cotton"), { gender: ["Female"], ageGroup: ["Toddler"], pattern: ["floral"] }),
};
