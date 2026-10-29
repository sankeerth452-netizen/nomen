# Nomen identity

**Nomen** is Latin for *name*. The product names every piece the way shoppers search for it, so the name *is* the product.
Tagline: **Named to be found.**

## The marks

| File | What it is | Use it for |
| --- | --- | --- |
| `nomen-lockup.svg` | Swing tag + NOMEN, with the string loop | Sign-in page, presentations, anything with room |
| `nomen-wordmark.svg` | NOMEN in tracked Didone capitals | Where the tag would be repeated nearby |
| `nomen-mark.svg` | The swing-tag monogram | Square spaces, avatars |
| `nomen-icon.svg` | The monogram without the eyelet ring | Favicon and app icon (≤ 28px) |

**The idea:** the swing tag is the cardboard tag every garment carries its name on. A Didone **N** is cut out of it, and the eyelet takes the string loop, the one touch of colour.

## Rules

- **Colours:** Ink `#161311` on Paper `#f6f2ec`. String loop in Wine `#7d2833` only. On dark backgrounds use the paper version (`<Lockup tone="paper" />`).
- **Clear space:** at least the height of the eyelet ring all around; never crowd the string loop.
- **Minimum size:** lockup at 14px cap height (drop the string loop below 20px); monogram at 16px.
- Don't recolour the tag, outline it, add shadows or gradients, or re-set NOMEN in another typeface.

## How it was made

Drawn from the real outlines of **Bodoni Moda** (SIL Open Font License 1.1, see `BodoniModa-OFL.txt`; using glyph outlines in a logo is allowed). The wordmark uses optical size 28 at weight 560, so the Didone hairlines survive at small sizes; the monogram N uses optical size 14 at weight 680 so it still reads at favicon size. NOMEN is tracked at 0.3 cap heights.

`compose.py` rebuilds every file from the font (`uv run --with fonttools python compose.py BodoniModa.ttf out/`). The app draws the same paths inline from `src/components/Logo.tsx` (`<Lockup />`, `<Wordmark />`, `<Mark />`).

Before using Nomen publicly, run a trademark search in the markets you'll trade in (IP Australia, and EUIPO/USPTO if relevant).
