const { fetchHTML, stripTags } = require("./_scraper");

// ── KOMIKU ───────────────────────────────────────────────────────────────────
// Komiku pakai WordPress + Manga plugin. Struktur kartu update:
// <div class="bge"> atau <div class="utao"> atau <li class="lup">
// dengan link ke /manga/SLUG/ dan img data-src
async function scrapeKomiku() {
  const BASE = "https://komiku.org";
  const html = await fetchHTML(BASE + "/", { Referer: BASE });
  const items = [];
  const seen = new Set();

  // Split per kartu — pisah di setiap tag pembuka div/li/article yang mengandung link komiku
  // Komiku homepage biasanya punya section "Komik Update" dalam <div class="bge"> atau <ul class="mng">
  
  // Cari semua blok yang mengandung link komiku.org/manga/ atau /manhwa/ atau /komik/
  // Pendekatan: ambil semua href komiku dulu, lalu cari konteks 500 char sebelumnya untuk img + title
  
  const urlReg = /href="(https?:\/\/komiku\.org\/(?:manga|manhwa|manhua|komik)\/([^"\/]+)\/)"/g;
  let m;
  while ((m = urlReg.exec(html)) !== null) {
    const url = m[1];
    const slug = m[2];
    if (seen.has(url)) continue;
    seen.add(url);

    // Ambil konteks 800 char sebelum dan sesudah href ini
    const start = Math.max(0, m.index - 800);
    const end   = Math.min(html.length, m.index + 400);
    const ctx   = html.slice(start, end);

    // Cari thumbnail — prioritas: data-src, data-lazy-src, lalu src
    const imgM = ctx.match(/(?:data-src|data-lazy-src|data-original)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/i)
              || ctx.match(/src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/i);

    // Cari judul — dari title attr, alt, atau heading
    const titleM = ctx.match(/title="([^"]{3,100})"/i)
                || ctx.match(/alt="([^"]{3,100})"/i)
                || ctx.match(/<(?:h3|h4|strong)[^>]*>([^<]{3,80})<\//i);

    // Chapter number
    const chM = ctx.match(/(?:Chapter|Ch\.?)\s*([\d.]+)/i);

    // Type (Manhwa/Manhua/Manga/Webtoon)
    const typeM = ctx.match(/\b(Manhwa|Manhua|Webtoon|Manga)\b/i);

    const judul = titleM ? stripTags(titleM[1]).trim()
                         : slug.replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase());

    if (!judul || judul.length < 2) continue;
    // Filter noise — skip nav/menu links
    if (/^(Home|Manga|Manhwa|Genre|Search|Login|Register|Latest|Update)$/i.test(judul)) continue;

    items.push({
      judul,
      url,
      chapter : chM  ? chM[1]       : "",
      thumbnail: imgM ? imgM[1]      : "",
      type    : typeM ? typeM[1]     : "Manga",
      source  : "Komiku",
    });
    if (items.length >= 30) break;
  }
  return items;
}

// ── MANHWALAND ───────────────────────────────────────────────────────────────
// ManhwaLand juga WP-based. URL: /manga/SLUG/ atau /manhwa/SLUG/
// Thumbnail sering pakai data-src (lazy load)
async function scrapeManhwaLand() {
  const BASE = "https://04x.manhwaland.land";
  const html = await fetchHTML(BASE + "/", { Referer: BASE });
  const items = [];
  const seen = new Set();

  // Ambil semua href manhwaland yang ke series
  const urlReg = /href="(https?:\/\/[^"]*manhwaland\.[^"\/]+\/(?:manga|manhwa|manhua|komik|series)\/([^"\/]+)\/)"/g;
  let m;
  while ((m = urlReg.exec(html)) !== null) {
    const url = m[1];
    const slug = m[2];
    if (seen.has(url)) continue;
    seen.add(url);

    const start = Math.max(0, m.index - 800);
    const end   = Math.min(html.length, m.index + 400);
    const ctx   = html.slice(start, end);

    // ManhwaLand banyak pakai data-src untuk lazy load
    const imgM = ctx.match(/(?:data-src|data-lazy-src|data-original)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/i)
              || ctx.match(/src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/i);

    const titleM = ctx.match(/title="([^"]{3,100})"/i)
                || ctx.match(/alt="([^"]{3,100})"/i)
                || ctx.match(/<(?:h3|h4|span)[^>]*class="[^"]*(?:title|ntitle|series)[^"]*"[^>]*>([^<]{3,80})<\//i);

    const chM = ctx.match(/(?:Chapter|Ch\.?)\s*([\d.]+)/i);
    const typeM = ctx.match(/\b(Manhwa|Manhua|Webtoon|Manga)\b/i);

    const judul = titleM ? stripTags(titleM[1]).trim()
                         : slug.replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase());
    if (!judul || judul.length < 2) continue;
    if (/^(Home|Manga|Manhwa|Genre|Search|Login|Register|Latest|Update)$/i.test(judul)) continue;

    items.push({
      judul,
      url,
      chapter : chM  ? chM[1]   : "",
      thumbnail: imgM ? imgM[1]  : "",
      type    : typeM ? typeM[1] : "Manhwa",
      source  : "ManhwaLand",
    });
    if (items.length >= 30) break;
  }
  return items;
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
    res.status(200).json({ ok: true, data: combined.slice(0,60), total: combined.length });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
