const { fetchHTML, stripTags } = require("./_scraper");

const GENRE_LIST = [
  {name:"Action",slug:"action"},{name:"Adventure",slug:"adventure"},
  {name:"Comedy",slug:"comedy"},{name:"Drama",slug:"drama"},
  {name:"Fantasy",slug:"fantasy"},{name:"Horror",slug:"horror"},
  {name:"Isekai",slug:"isekai"},{name:"Magic",slug:"magic"},
  {name:"Martial Arts",slug:"martial-arts"},{name:"Mecha",slug:"mecha"},
  {name:"Mystery",slug:"mystery"},{name:"Psychological",slug:"psychological"},
  {name:"Romance",slug:"romance"},{name:"School",slug:"school"},
  {name:"Sci-Fi",slug:"sci-fi"},{name:"Seinen",slug:"seinen"},
  {name:"Shoujo",slug:"shoujo"},{name:"Shounen",slug:"shounen"},
  {name:"Slice of Life",slug:"slice-of-life"},{name:"Sports",slug:"sports"},
  {name:"Supernatural",slug:"supernatural"},{name:"Thriller",slug:"thriller"},
  {name:"Webtoon",slug:"webtoon"},
];

function parseList(html, source) {
  const items = [];
  const seen = new Set();
  const urlReg = source === "ManhwaLand"
    ? /href="(https?:\/\/[^"]*manhwaland\.[^"\/]+\/(?:manga|manhwa|manhua|series)\/([^"\/]+)\/)"/g
    : /href="(https?:\/\/komiku\.org\/(?:manga|manhwa|manhua|komik)\/([^"\/]+)\/)"/g;
  let m;
  while ((m = urlReg.exec(html)) !== null) {
    const url = m[1], slug = m[2];
    if (seen.has(url)) continue;
    seen.add(url);
    const start = Math.max(0, m.index - 800);
    const ctx   = html.slice(start, Math.min(html.length, m.index + 400));
    const imgM  = ctx.match(/(?:data-src|data-lazy-src|data-original)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/i)
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
      judul, url,
      chapter  : chM   ? chM[1]   : "",
      thumbnail: imgM  ? imgM[1]  : "",
      type     : typeM ? typeM[1] : (source === "ManhwaLand" ? "Manhwa" : "Manga"),
      source,
    });
    if (items.length >= 24) break;
  }
  return items;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  const slug = req.query.slug || "";
  const page = parseInt(req.query.page) || 1;
  const src  = req.query.src || "komiku";
  if (!slug) return res.status(200).json({ ok:true, genres: GENRE_LIST });
  try {
    let url, origin, sourceName;
    if (src === "manhwaland") {
      origin = "https://04x.manhwaland.land";
      url    = `${origin}/genres/${slug}/page/${page}/`;
      sourceName = "ManhwaLand";
    } else {
      origin = "https://komiku.org";
      url    = `${origin}/genre/${slug}/page/${page}/`;
      sourceName = "Komiku";
    }
    const html = await fetchHTML(url, { Referer: origin });
    const data = parseList(html, sourceName);
    const hasNext = html.includes(`/page/${page+1}/`) || html.includes('rel="next"');
    res.status(200).json({ ok:true, data, page, hasNext, source: sourceName });
  } catch(e) {
    res.status(500).json({ ok:false, error: e.message });
  }
};
