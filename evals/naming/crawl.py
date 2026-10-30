"""Collect Sportsgirl products for the Nomen quality test. Polite: one request every 10 s (robots.txt Crawl-delay: 10),
no query strings. Saves raw pages under OUT/pages and a products.json summary.

usage: python crawl.py OUT_DIR PER_CATEGORY
"""
import html
import json
import os
import re
import sys
import time
import urllib.request

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
BASE = "https://www.sportsgirl.com.au"
CATEGORIES = {
    "dresses": "/clothing/dresses", "tops": "/clothing/tops", "shirts": "/clothing/shirts-blouses",
    "tees": "/clothing/t-shirts", "pants": "/clothing/pants", "jeans": "/clothing/jeans", "skirts": "/clothing/skirts",
    "shorts": "/clothing/shorts", "knitwear": "/clothing/knitwear", "jackets": "/clothing/jackets-coats",
    "bags": "/accessories/bags", "jewellery": "/accessories/jewellery",
}
DELAY = 10.5
last = 0.0


def get(path):
    global last
    wait = DELAY - (time.time() - last)
    if wait > 0:
        time.sleep(wait)
    last = time.time()
    req = urllib.request.Request(BASE + path, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "ignore")


def text_of(page):
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", page, flags=re.S)
    t = html.unescape(re.sub(r"<[^>]+>", "\n", t))
    return re.sub(r"\n\s*\n+", "\n", t)


def parse_pdp(page):
    t = text_of(page)
    name = re.search(r'<meta property="og:title" content="([^"]+)"', page)
    desc = re.search(r"Description:\n(.*?)\n(?:Fit and Sizing|How to Style It|Product information:)", t, re.S)
    fab = re.search(r"Fabrication:\n([^\n]+)", t)
    return {
        "name": html.unescape(name.group(1)).strip() if name else None,
        "description": re.sub(r"\s+", " ", desc.group(1)).strip() if desc else None,
        "fabrication": fab.group(1).strip() if fab else None,
    }


def main():
    out, per = sys.argv[1], int(sys.argv[2])
    os.makedirs(os.path.join(out, "pages"), exist_ok=True)
    products = []
    for cat, path in CATEGORIES.items():
        try:
            listing = get(path)
        except Exception as e:
            print("skip category", cat, e, flush=True)
            continue
        links = list(dict.fromkeys(re.findall(r'class="product-item-link"\s+href="(https://www\.sportsgirl\.com\.au/[a-z0-9-]+)"', listing)))
        seen_styles, picked = set(), []
        for url in links:
            style = re.sub(r"-[a-z-]*?-\d{6}-\d{3}$", "", url.rsplit("/", 1)[1])  # same style in another colour = same style
            if style in seen_styles:
                continue
            seen_styles.add(style)
            picked.append(url)
            if len(picked) >= per:
                break
        print(cat, len(links), "listed,", len(picked), "picked", flush=True)
        for url in picked:
            slug = url.rsplit("/", 1)[1]
            try:
                page = get("/" + slug)
            except Exception as e:
                print("  skip", slug, e, flush=True)
                continue
            open(os.path.join(out, "pages", slug + ".html"), "w").write(page)
            m = re.search(r"-(\d{6})-(\d{3})$", slug)
            p = {"category": cat, "url": url, "slug": slug, "product_code": m.group(1) if m else None, **parse_pdp(page)}
            products.append(p)
            print("  ", p["name"], "|", (p["fabrication"] or "-"), "|", "desc" if p["description"] else "NO DESC", flush=True)
            json.dump(products, open(os.path.join(out, "products.json"), "w"), indent=1)
    print("done", len(products), flush=True)


if __name__ == "__main__":
    main()
