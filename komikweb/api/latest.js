const { fetchHTML, stripTags } = require("./_scraper");

function extractItems(html, urlRegStr, sourceName, defaultType) {
  const items = [];
  const seen = new Set();
  const urlReg = new RegExp(urlRegStr, "g");
  let m;
  while ((m = urlReg.exec(html)) !== null) {
    const url  = m[1];
    const slug = m[2];
    if (seen.has(url)) continue;
    seen.add(url);

    const start = Math.max(0, m.index - 900);
    const end   = Math.min(html.length, m.index + 500);
    const ctx   = html.slice(start, end);

    // Thumbnail — prioritas data-src (lazy load)
    const imgM = ctx.match(/data-src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/i)
              || ctx.match(/data-lazy-src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/i)
              || ctx.match(/data-original="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/i)
              || ctx.match(/src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/i);

    // Filter thumbnail noise
    const thumb = imgM ? imgM[1] : "";
    if (thumb && /(?:logo|icon|avatar|ads|pixel|emoji|spinner)/i.test(thumb)) continue;

    // Judul
    const titleM = ctx.match(/title="([^"]{3,100})"/i)
                || ctx.match(/alt="([^"]{3,100})"/i)
                || ctx.match(/<(?:h3|h4|h2|strong)[^>]*>([^<]{3,80})<\//i);

    const chM   = ctx.match(/(?:Chapter|Ch\.?)\s*([\d.]+)/i);
    const typeM = ctx.match(/\b(Manhwa|Manhua|Webtoon|Manga)\b/i);

    const judul = titleM
      ? stripTags(titleM[1]).trim()
      : slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

    if (!judul || judul.length < 2) continue;
    if (/^(Home|Manga List|Manhwa|Genre|Search|Login|Register|Latest|Update|Read|Baca)$/i.test(judul)) continue;

    items.push({
      judul,
      url,
      chapter  : chM   ? chM[1]     : "",
      thumbnail: thumb,
      type     : typeM ? typeM[1]   : defaultType,
      source   : sourceName,
    });
    if (items.length >= 30) break;
  }
  return items;
}

async function scrapeKomiku() {
  const BASE = "https://komiku.org";
  const html = await fetchHTML(BASE + "/", { Referer: BASE });
  return extractItems(
    html,
    `href="(https?://komiku\\.org/(?:manga|manhwa|manhua|komik)/([^"/]+)/)"`,
    "Komiku",
    "Manga"
  );
}

async function scrapeManhwaLand() {
  const BASE = "https://04x.manhwaland.land";
  const html = await fetchHTML(BASE + "/", { Referer: BASE });
  return extractItems(
    html,
    `href="(https?://[^"]*manhwaland\\.[^"/]+/(?:manga|manhwa|manhua|komik|series)/([^"/]+)/)"`,
    "ManhwaLand",
    "Manhwa"
  );
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  try {
    const [resKomiku, resManhwa] = await Promise.allSettled([
      scrapeKomiku(),
      scrapeManhwaLand(),
    ]);

    const errors = [];
    if (resKomiku.status  === "rejected") errors.push("Komiku: " + resKomiku.reason?.message);
    if (resManhwa.status  === "rejected") errors.push("ManhwaLand: " + resManhwa.reason?.message);

    const combined = [];
    const seen = new Set();
    for (const r of [resKomiku, resManhwa]) {
      if (r.status === "fulfilled") {
        for (const item of r.value) {
          if (!seen.has(item.url) && item.judul) {
            seen.add(item.url);
            combined.push(item);
          }
        }
      }
    }

    if (combined.length === 0 && errors.length > 0) {
      return res.status(500).json({ ok: false, error: errors.join(" | ") });
    }

    res.status(200).json({
      ok: true,
      data: combined.slice(0, 60),
      total: combined.length,
      warnings: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
