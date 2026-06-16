const { fetchHTML, stripTags } = require("./_scraper");

const GENRE_LIST = [
  { name: "Action", slug: "action" },
  { name: "Adventure", slug: "adventure" },
  { name: "Comedy", slug: "comedy" },
  { name: "Drama", slug: "drama" },
  { name: "Fantasy", slug: "fantasy" },
  { name: "Horror", slug: "horror" },
  { name: "Isekai", slug: "isekai" },
  { name: "Magic", slug: "magic" },
  { name: "Martial Arts", slug: "martial-arts" },
  { name: "Mecha", slug: "mecha" },
  { name: "Mystery", slug: "mystery" },
  { name: "Psychological", slug: "psychological" },
  { name: "Romance", slug: "romance" },
  { name: "School", slug: "school" },
  { name: "Sci-Fi", slug: "sci-fi" },
  { name: "Seinen", slug: "seinen" },
  { name: "Shoujo", slug: "shoujo" },
  { name: "Shounen", slug: "shounen" },
  { name: "Slice of Life", slug: "slice-of-life" },
  { name: "Sports", slug: "sports" },
  { name: "Supernatural", slug: "supernatural" },
  { name: "Thriller", slug: "thriller" },
  { name: "Webtoon", slug: "webtoon" },
];

function parseKomikList(html, source, origin) {
  const items = [];
  const seen = new Set();
  const blocks = html.split(/<(?:div|article|li)\s/i);

  for (const block of blocks) {
    const hrefM = block.match(/href="(https?:\/\/[^"]*\/(?:manga|manhwa|manhua|komik|series)\/([^"\/]+)\/?)"/)
    if (!hrefM) continue;
    const url = hrefM[1].replace(/\/$/, "") + "/";
    if (seen.has(url) || url.includes("/page/") || url.includes("/wp-") || url.includes("/tag/")) continue;
    seen.add(url);

    const imgM = block.match(/(?:data-src|data-lazy|data-original|src)\s*=\s*["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)['"]/i);
    const titleM = block.match(/(?:title|alt)\s*=\s*["']([^"']{3,100})['"]/i)
                || block.match(/<(?:h\d|strong|span)[^>]*>([^<]{3,100})<\//i);
    const chapterM = block.match(/Chapter\s*([\d.]+)/i);
    const typeM = block.match(/\b(Manhwa|Manhua|Manga|Webtoon)\b/i);

    const slug = hrefM[2] || "";
    const rawTitle = titleM ? stripTags(titleM[1]) : slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const judul = rawTitle.replace(/\s*[-|]\s*(?:Komiku|ManhwaLand)[^$]*/i, "").trim();
    if (judul.length < 2) continue;

    let thumbnail = "";
    if (imgM) {
      const u = imgM[1];
      if (!/logo|icon|banner|ads|pixel|gravatar|favicon/i.test(u)) thumbnail = u;
    }

    items.push({
      judul, url,
      chapter: chapterM ? chapterM[1] : "",
      thumbnail,
      type: typeM ? typeM[1] : (source === "ManhwaLand" ? "Manhwa" : "Manga"),
      source,
    });
    if (items.length >= 30) break;
  }
  return items;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  const slug = req.query.slug || "";
  const page = parseInt(req.query.page) || 1;
  const src  = req.query.src || "komiku";

  if (!slug) {
    return res.status(200).json({ ok: true, genres: GENRE_LIST });
  }

  try {
    let url, origin, sourceName;
    if (src === "manhwaland") {
      origin = "https://manhwaland.wiki";
      url = `${origin}/genres/${slug}/page/${page}/`;
      sourceName = "ManhwaLand";
    } else {
      origin = "https://komiku.org";
      url = `${origin}/genre/${slug}/page/${page}/`;
      sourceName = "Komiku";
    }

    const html = await fetchHTML(url, { Referer: origin });
    const data = parseKomikList(html, sourceName, origin);
    const hasNext = html.includes(`/page/${page + 1}/`) || html.includes('class="next');

    res.status(200).json({ ok: true, data, page, hasNext, source: sourceName });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
