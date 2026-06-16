const { fetchHTML, stripTags } = require("./_scraper");

const SOURCES = [
  {
    name: "Komiku",
    origin: "https://komiku.org",
    // Komiku pakai ?s= untuk search
    searchUrl: q => `https://komiku.org/?s=${encodeURIComponent(q)}&post_type=manga`,
    searchUrl2: q => `https://komiku.org/?s=${encodeURIComponent(q)}`,
    urlPattern: /komiku\.org\/(?:manga|manhwa|manhua|komik)\//,
  },
  {
    name: "ManhwaLand",
    origin: "https://manhwaland.wiki",
    searchUrl: q => `https://manhwaland.wiki/?s=${encodeURIComponent(q)}`,
    searchUrl2: q => `https://manhwaland.wiki/search/${encodeURIComponent(q)}/`,
    urlPattern: /(?:manhwaland|manhwaindo)[^/]+\/(?:manga|manhwa|manhua|komik|series)\//,
  },
];

function parseSearchResults(html, source) {
  const items = [];
  const seen = new Set();
  const blocks = html.split(/<(?:div|article|li)\s/i);

  for (const block of blocks) {
    // Cari URL komik sesuai pola sumber
    let hrefM = block.match(/href="(https?:\/\/[^"]+\/?)"/) ;
    if (!hrefM) continue;
    
    const u = hrefM[1];
    if (!source.urlPattern.test(u)) continue;
    if (u.includes("/page/") || u.includes("/tag/") || u.includes("/genre/") || u.includes("/wp-")) continue;
    
    const url = u.replace(/\/$/, "") + "/";
    if (seen.has(url)) continue;
    seen.add(url);

    const imgM = block.match(/(?:data-src|data-lazy|data-original|src)\s*=\s*["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)['"]/i);
    const titleM = block.match(/(?:title|alt)\s*=\s*["']([^"']{3,100})['"]/i)
                || block.match(/<(?:h\d|strong|span)[^>]*>([^<]{3,100})<\//i);
    const chapterM = block.match(/Chapter\s*([\d.]+)/i) || block.match(/Ch\.?\s*([\d.]+)/i);
    const typeM = block.match(/\b(Manhwa|Manhua|Manga|Webtoon)\b/i);

    const slug = url.replace(/\/$/, "").split("/").pop();
    const rawTitle = titleM ? stripTags(titleM[1]) : slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const judul = rawTitle.replace(/\s*[-|]\s*(?:Komiku|ManhwaLand)[^$]*/i, "").trim();
    if (judul.length < 2) continue;

    let thumbnail = "";
    if (imgM) {
      const u2 = imgM[1];
      if (!/logo|icon|banner|ads|pixel|gravatar|favicon/i.test(u2)) thumbnail = u2;
    }

    items.push({
      judul,
      url,
      chapter: chapterM ? chapterM[1] : "",
      thumbnail,
      type: typeM ? typeM[1] : (source.name === "ManhwaLand" ? "Manhwa" : "Manga"),
      source: source.name,
    });
    if (items.length >= 24) break;
  }
  return items;
}

async function searchSource(source, q) {
  // Coba URL search utama, fallback ke URL kedua
  for (const urlFn of [source.searchUrl, source.searchUrl2]) {
    if (!urlFn) continue;
    try {
      const html = await fetchHTML(urlFn(q), { Referer: source.origin });
      const results = parseSearchResults(html, source);
      if (results.length > 0) return results;
    } catch (e) {
      continue;
    }
  }
  return [];
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  const q = (req.query.q || "").trim();
  if (!q || q.length < 2) return res.status(400).json({ ok: false, error: "Query minimal 2 karakter" });
  try {
    const results = await Promise.allSettled(SOURCES.map(s => searchSource(s, q)));
    const combined = [];
    const seen = new Set();
    results.forEach(r => {
      if (r.status === "fulfilled") {
        r.value.forEach(item => {
          if (!seen.has(item.url) && item.judul) {
            seen.add(item.url);
            combined.push(item);
          }
        });
      }
    });
    res.status(200).json({ ok: true, data: combined, total: combined.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
