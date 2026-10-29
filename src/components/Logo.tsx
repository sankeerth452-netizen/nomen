// Nomen identity. Drawn from Bodoni Moda outlines (SIL Open Font License): the wordmark at optical size 28,
// the monogram N at 14 so it still reads at favicon size. The mark is a swing tag, the cardboard tag every
// garment carries its name on. Source files: scratchpad brand/compose.py (regenerate there, then paste the paths).

export const PRODUCT_NAME = "Nomen";
export const TAGLINE = "Named to be found.";

const INK = "#161311";
const PAPER = "#f6f2ec";
const WINE = "#7d2833";

/** NOMEN in tracked capitals. Cap height 100 units, x from 0 to 611.4. */
const WORD = "M14.4 0V99H30.1V100H0V99H13.3V1H0V0ZM94.7 0V1H80.7V101.3H79.4L13.7 0H33.4L79.7 73.2V1H64.1V0Z M177.3 101.3Q166.9 101.3 158.7 97.4Q150.6 93.5 144.9 86.4Q139.2 79.4 136.3 70.1Q133.3 60.8 133.3 50Q133.3 39.2 136.5 29.9Q139.6 20.6 145.4 13.6Q151.2 6.5 159.3 2.6Q167.4 -1.3 177.3 -1.3Q187.2 -1.3 195.2 2.6Q203.3 6.5 209.1 13.6Q214.9 20.6 218 29.9Q221.2 39.2 221.2 50Q221.2 60.8 218.2 70.1Q215.3 79.4 209.6 86.4Q204 93.5 195.8 97.4Q187.6 101.3 177.3 101.3ZM177.3 100.4Q185.2 100.4 190 96.2Q194.9 92 197.5 84.9Q200.2 77.7 201.1 68.7Q202.1 59.7 202.1 50Q202.1 40.3 200.9 31.3Q199.8 22.3 197 15.1Q194.3 8 189.5 3.8Q184.6 -0.4 177.3 -0.4Q169.9 -0.4 165.1 3.8Q160.2 8 157.5 15.1Q154.7 22.3 153.6 31.3Q152.4 40.3 152.4 50Q152.4 59.7 153.4 68.7Q154.4 77.8 157 84.9Q159.6 92 164.5 96.2Q169.4 100.4 177.3 100.4Z M307.6 101.3 270.6 0H287.1L315.9 77.6L343.2 0H344.3L308.8 101.3ZM271.1 0V99H281.3V100H260.4V99H270V1H259.8V0ZM369.8 0V1H360.4V99H369.8V100H333.3V99H344V0Z M405.2 100V99H417.2V1H405.2V0H478.3V27.3H477.3Q476.8 20.2 474 14.2Q471.2 8.2 465.9 4.6Q460.6 1 452.8 1H433.7V99H451.4Q460.6 99 466.4 95.3Q472.2 91.6 475.2 85Q478.2 78.5 478.6 70H479.6V100ZM455.6 63.9Q455.1 59.4 452.8 56Q450.6 52.6 447.2 50.7Q443.8 48.8 440 48.8H428.9V47.8H440Q443.8 47.8 447.2 46Q450.6 44.3 452.8 41Q455.1 37.8 455.6 33.3H456.6V63.9Z M531.1 0V99H546.9V100H516.7V99H530.1V1H516.7V0ZM611.4 0V1H597.4V101.3H596.1L530.4 0H550.1L596.4 73.2V1H580.9V0Z";
/** The swing tag in a 100 x 100 square: chamfered top corners, eyelet at (50, 18.5). */
const TAG = "M33 4H67L82 19V96H18V19Z";
/** The monogram N, knocked out of the tag. */
const N = "M36.8 42V81.2H43V82H30.5V81.2H35.9V42.8H30.5V42ZM69.5 42V42.8H63.9V82.5H62.7L36.2 42H45.8L63 68.8V42.8H56.9V42Z";
/** The tag's string loop, in lockup units. */
const THREAD = "M47.3 3.4C-2.7 -70.6 97.3 -70.6 47.3 3.4";

type Tone = "ink" | "paper";
const colours = (tone: Tone) => (tone === "ink" ? { fg: INK, cut: PAPER } : { fg: PAPER, cut: INK });

function TagMark({ tone, ring }: { tone: Tone; ring: boolean }) {
  const { fg, cut } = colours(tone);
  return (
    <>
      <path d={TAG} fill={fg} />
      <circle cx={50} cy={18.5} r={3.6} fill={cut} />
      {ring && <circle cx={50} cy={18.5} r={7} fill="none" stroke={cut} strokeWidth={1.4} />}
      <path d={N} fill={cut} />
    </>
  );
}

/** The swing-tag monogram on its own (favicon, small spaces). Height sets the size. */
export function Mark({ height = 32, tone = "ink" }: { height?: number; tone?: Tone }) {
  return (
    <svg viewBox="16 2 68 96" height={height} width={(height * 68) / 96} role="img" aria-label={PRODUCT_NAME}>
      <TagMark tone={tone} ring={height >= 28} />
    </svg>
  );
}

/** NOMEN on its own. Height is the cap height in pixels. */
export function Wordmark({ height = 18, tone = "ink" }: { height?: number; tone?: Tone }) {
  return (
    <svg viewBox="0 -1.3 611.4 102.6" height={height * 1.026} width={(height * 611.4) / 100} role="img" aria-label={PRODUCT_NAME}>
      <path d={WORD} fill={colours(tone).fg} />
    </svg>
  );
}

/** The full logo: tag + NOMEN, with the string loop. Height is the cap height of NOMEN in pixels. */
export function Lockup({ height = 22, tone = "ink", thread = true }: { height?: number; tone?: Tone; thread?: boolean }) {
  // Tag spans y -18..118 in these units, the string loop rises to -53.
  const top = thread ? -56.6 : -22;
  const vh = 122 - top;
  return (
    <svg viewBox={`-4 ${top} 784 ${vh}`} height={(height * vh) / 100} width={(height * 784) / 100} role="img" aria-label={PRODUCT_NAME}>
      {thread && <path d={THREAD} fill="none" stroke={WINE} strokeWidth={2.2} strokeLinecap="round" />}
      <g transform="translate(-26.6 -23.9) scale(1.4783)"><TagMark tone={tone} ring /></g>
      <g transform="translate(164.6 0)"><path d={WORD} fill={colours(tone).fg} /></g>
    </svg>
  );
}
