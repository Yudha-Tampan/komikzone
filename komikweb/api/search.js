const { fetchHTML, stripTags } = require("./_scraper");

const SOURCES = [
  {
    name: "Komiku",
    origin: "https://komiku.org",
    searchUrl: q => `https://komiku.org/?s=${encodeURIComponent(q)}&post_type=manga`,
    urlReg: /href="(https?:\/\/komiku\.org\/(?:manga|manhwa|manhua|komik)\/([^"\/]+)\/)"/g,
  },
  {
    name: "ManhwaLand",
    origin: "https://04x.manhwaland.land",
    searchUrl: q => `https://04x.manhwaland.land/?s=${encodeURIComponent(q)}`,
    urlReg: /href="(https?:\/\/[^"]*manhwaland\.[^"\/]+\/(?:manga|manhwa|manhua|komik|series)\/([^"\/]+)\/)"/g,
  },
];

async function searchSource(source, q) {
  try {
    const html = await fetchHTML(source.searchUrl(q), { Referer: source.origin });
    const items = [];
    const seen = new Set();
    const reg = new RegExp(source.urlReg.source, "g");
    let m;
    while ((m = reg.exec(html)) !== null) {
      const url = m[1], slug = m[2];
      if (seen.has(url)) continue;
      seen.add(url);

      const start = Math.max(0, m.index - 800);
      const end   = Math.min(html.length, m.index + 400);
      const ctx   = html.slice(start, end);

      const imgM = ctx.match(/(?:data-src|data-lazy-src|data-original)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/i)
                || ctx.match(/src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/i);
      const titleM = ctx.match(/title="([^"]{3,100})"/i)
                  || ctx.match(/alt="([^"]{3,100})"/i)
                  || ctx.match(/<(?:h3|h4|strong)[^>]*>([^<]{3,80})<\//i);
      const chM   = ctx.match(/(?:Chapter|Ch\.?)\s*([\d.]+)/i);
      const typeM = ctx.match(/\b(Manhwa|Manhua|Webtoon|Manga)\b/i);

      const judul = titleM ? stripTags(titleM[1]).trim()
                           : slug.replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase());
      if (!judul || judul.length < 2) continue;
      if (/^(Home|Manga|Manhwa|Genre|Search|Login)$/i.test(judul)) continue;

      items.push({
        judul,
        url,
        chapter  : chM   ? chM[1]   : "",
        thumbnail: imgM  ? imgM[1]  : "",
        type     : typeM ? typeM[1] : (source.name === "ManhwaLand" ? "Manhwa" : "Manga"),
        source   : source.name,
      });
      if (items.length >= 20) break;
    }
    return items;
  } catch(e) { return []; }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  const q = req.query.q || "";
  if (!q) return res.status(400).json({ ok:false, error:"Query kosong" });
  try {
    const results = await Promise.allSettled(SOURCES.map(s => searchSource(s, q)));
    const combined = [];
    const seen = new Set();
    results.forEach(r => {
      if (r.status === "fulfilled") r.value.forEach(item => {
        if (!seen.has(item.url) && item.judul) { seen.add(item.url); combined.push(item); }
      });
    });
    res.status(200).json({ ok:true, data: combined });
  } catch(e) {
    res.status(500).json({ ok:false, error: e.message });
  }
};
