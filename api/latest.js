const { fetchHTML, stripTags } = require("./_scraper");

// ── KOMIKU ────────────────────────────────────────────────────────────────────
async function scrapeKomiku() {
  const BASE = "https://komiku.org";
  // Coba halaman utama dan juga halaman daftar manga
  const html = await fetchHTML(BASE + "/", { Referer: BASE });
  const items = [];
  const seen = new Set();

  // Komiku menggunakan struktur: div.bge (atau list-update_item) dengan a href ke /manga/
  // Kita split per article/div besar, cari semua komik
  const blocks = html.split(/<(?:article|div)\s/i);
  
  for (const block of blocks) {
    // Cari URL komik (bisa manga/manhwa/manhua/komik)
    const hrefM = block.match(/href="(https?:\/\/komiku\.org\/(?:manga|manhwa|manhua|komik)\/([^"\/]+)\/?)"/)
    if (!hrefM) continue;
    const url = hrefM[1].replace(/\/$/, "") + "/";
    if (seen.has(url)) continue;
    seen.add(url);

    // Thumbnail - komiku sering pakai data-src atau src di img
    const imgM = block.match(/(?:data-src|data-lazy|src)\s*=\s*["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)['"]/i);
    
    // Judul dari alt, title, atau teks h3/h4
    const titleM = block.match(/(?:title|alt)\s*=\s*["']([^"']{3,100})['"]/i)
                || block.match(/<(?:h\d|strong|b)\s[^>]*>([^<]{3,100})<\/(?:h\d|strong|b)>/i)
                || block.match(/<(?:h\d|strong|b)>([^<]{3,100})<\/(?:h\d|strong|b)>/i);
    
    // Chapter terbaru
    const chapterM = block.match(/Chapter\s*([\d.]+)/i) || block.match(/Ch\.?\s*([\d.]+)/i);
    
    // Type
    const typeM = block.match(/\b(Manhwa|Manhua|Manga|Webtoon)\b/i);

    const slug = hrefM[2] || "";
    const rawTitle = titleM ? stripTags(titleM[1]) : slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const judul = rawTitle.replace(/\s*-\s*Komiku\.org\s*$/i, "").trim();
    
    if (judul.length < 2 || judul.toLowerCase().includes("komiku") || judul.toLowerCase().includes("baca manga")) continue;
    
    // Filter thumbnail yang bukan gambar komik
    let thumbnail = "";
    if (imgM) {
      const u = imgM[1];
      if (!/logo|icon|banner|ads|pixel|gravatar|favicon/i.test(u)) {
        thumbnail = u;
      }
    }

    items.push({
      judul,
      url,
      chapter: chapterM ? chapterM[1] : "",
      thumbnail,
      type: typeM ? typeM[1] : "Manga",
      source: "Komiku",
    });
    if (items.length >= 40) break;
  }

  // Jika hasil terlalu sedikit, coba halaman manga list
  if (items.length < 5) {
    return await scrapeKomikuList();
  }
  return items;
}

async function scrapeKomikuList() {
  const BASE = "https://komiku.org";
  const html = await fetchHTML(BASE + "/daftar-komik/", { Referer: BASE });
  const items = [];
  const seen = new Set();
  const blocks = html.split(/<(?:article|div)\s/i);
  for (const block of blocks) {
    const hrefM = block.match(/href="(https?:\/\/komiku\.org\/(?:manga|manhwa|manhua|komik)\/([^"\/]+)\/?)"/)
    if (!hrefM) continue;
    const url = hrefM[1].replace(/\/$/, "") + "/";
    if (seen.has(url)) continue;
    seen.add(url);
    const imgM = block.match(/(?:data-src|data-lazy|src)\s*=\s*["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)['"]/i);
    const titleM = block.match(/(?:title|alt)\s*=\s*["']([^"']{3,100})['"]/i)
                || block.match(/<(?:h\d|strong)[^>]*>([^<]{3,100})<\//i);
    const chapterM = block.match(/Chapter\s*([\d.]+)/i);
    const typeM = block.match(/\b(Manhwa|Manhua|Manga|Webtoon)\b/i);
    const slug = hrefM[2] || "";
    const rawTitle = titleM ? stripTags(titleM[1]) : slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const judul = rawTitle.replace(/\s*-\s*Komiku\.org\s*$/i, "").trim();
    if (judul.length < 2) continue;
    let thumbnail = imgM ? imgM[1] : "";
    if (/logo|icon|banner|ads|pixel|gravatar|favicon/i.test(thumbnail)) thumbnail = "";
    items.push({ judul, url, chapter: chapterM ? chapterM[1] : "", thumbnail, type: typeM ? typeM[1] : "Manga", source: "Komiku" });
    if (items.length >= 40) break;
  }
  return items;
}

// ── MANHWALAND ─────────────────────────────────────────────────────────────────
async function scrapeManhwaLand() {
  const BASES = [
    "https://manhwaland.wiki",
    "https://04x.manhwaland.land",
  ];
  
  for (const BASE of BASES) {
    try {
      const html = await fetchHTML(BASE + "/", {
        Referer: BASE,
        "Cookie": "",
      });
      const items = [];
      const seen = new Set();
      const blocks = html.split(/<(?:article|div|li)\s/i);

      for (const block of blocks) {
        // Manhwaland URL pattern
        const hrefM = block.match(/href="(https?:\/\/[^"]*(?:manhwaland|manhwaindo)[^"]*\/(?:manga|manhwa|manhua|komik|series)\/([^"\/]+)\/?)"/)
                   || block.match(/href="(https?:\/\/[^"]+\/(?:manga|manhwa|manhua|series)\/([^"\/]+)\/?)"/)
        if (!hrefM) continue;
        const url = hrefM[1].replace(/\/$/, "") + "/";
        if (seen.has(url) || url.includes("/wp-") || url.includes("/page/")) continue;
        seen.add(url);

        // Thumbnail - manhwaland sering pakai data-src (lazy load)
        const imgM = block.match(/(?:data-src|data-lazy|data-original|src)\s*=\s*["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)['"]/i);
        const titleM = block.match(/(?:title|alt)\s*=\s*["']([^"']{3,100})['"]/i)
                    || block.match(/<(?:h\d|span|strong)[^>]*class="[^"]*(?:title|name)[^"]*"[^>]*>([^<]{3,100})<\//i)
                    || block.match(/<(?:h\d|strong)[^>]*>([^<]{3,100})<\//i);
        const chapterM = block.match(/Chapter\s*([\d.]+)/i) || block.match(/Ch\.?\s*([\d.]+)/i);
        const typeM = block.match(/\b(Manhwa|Manhua|Manga|Webtoon)\b/i);

        const slug = hrefM[2] || "";
        const rawTitle = titleM ? stripTags(titleM[1]) : slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        const judul = rawTitle.replace(/\s*[-|]\s*(?:ManhwaLand|Manhwa Land)\s*$/i, "").trim();
        if (judul.length < 2) continue;

        let thumbnail = "";
        if (imgM) {
          const u = imgM[1];
          if (!/logo|icon|banner|ads|pixel|gravatar|favicon/i.test(u)) {
            thumbnail = u;
          }
        }

        items.push({
          judul,
          url,
          chapter: chapterM ? chapterM[1] : "",
          thumbnail,
          type: typeM ? typeM[1] : "Manhwa",
          source: "ManhwaLand",
        });
        if (items.length >= 40) break;
      }

      if (items.length > 0) return items;
    } catch (e) {
      continue;
    }
  }
  return [];
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  try {
    const [komiku, manhwa] = await Promise.allSettled([
      scrapeKomiku(),
      scrapeManhwaLand(),
    ]);

    const combined = [];
    const seen = new Set();

    for (const r of [komiku, manhwa]) {
      if (r.status === "fulfilled") {
        for (const item of r.value) {
          if (!seen.has(item.url) && item.judul && item.judul.length > 1) {
            seen.add(item.url);
            combined.push(item);
          }
        }
      }
    }

    if (combined.length === 0) {
      const errors = [komiku, manhwa].filter(r => r.status === "rejected").map(r => r.reason?.message);
      return res.status(500).json({ ok: false, error: "Gagal memuat semua sumber: " + errors.join(", ") });
    }

    res.status(200).json({ ok: true, data: combined.slice(0, 80), total: combined.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
