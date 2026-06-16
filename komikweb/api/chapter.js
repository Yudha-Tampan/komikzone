const { fetchHTML, stripTags } = require("./_scraper");

function parseChapter(html, pageUrl) {
  const origin = new URL(pageUrl).origin;

  // Judul chapter
  const titleM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleM ? stripTags(titleM[1]).trim() : "Chapter";

  const images = [];
  const seen = new Set();

  function addImg(u) {
    if (!u || seen.has(u)) return;
    // Filter noise: icon, logo, ads, avatar, pixel, banner kecil
    if (/(?:logo|icon|banner|avatar|ads|pixel|gravatar|emoji|spinner|load|button)/i.test(u)) return;
    seen.add(u);
    images.push(u);
  }

  // ── METODE 1: ts_reader.run({...}) — WP Manga + Komiku ──────────────────
  const tsM = html.match(/ts_reader\.run\(([\s\S]*?)\);/i);
  if (tsM) {
    // Ambil sources array
    const srcM = tsM[1].match(/"sources"\s*:\s*\[([\s\S]*?)\]/i);
    if (srcM) {
      const imgMatches = [...srcM[1].matchAll(/"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"]*)?)"/gi)];
      imgMatches.forEach(m => addImg(m[1]));
    }
    // Fallback: ambil semua URL gambar dalam ts_reader
    if (images.length === 0) {
      const allImgs = [...tsM[1].matchAll(/"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"]*)?)"/gi)];
      allImgs.forEach(m => addImg(m[1]));
    }
  }

  // ── METODE 2: JSON array "pages" dalam script tag ──────────────────────
  if (images.length === 0) {
    const scriptReg = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let sm;
    while ((sm = scriptReg.exec(html)) !== null) {
      const sc = sm[1];
      if (!sc.includes("http")) continue;
      // Cari pola pages/images array
      const pagesM = sc.match(/(?:pages|images|imgs|chapter_images)\s*[=:]\s*\[([\s\S]*?)\]/i);
      if (pagesM) {
        const imgM = [...pagesM[1].matchAll(/"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"]*)?)"/gi)];
        imgM.forEach(m => addImg(m[1]));
      }
      // Pola: "url":"http..." dalam JSON
      const urlM = [...sc.matchAll(/"(?:url|src|img)"\s*:\s*"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"]*)?)"/gi)];
      urlM.forEach(m => addImg(m[1]));
    }
  }

  // ── METODE 3: img tags dalam #readerarea / .reading-content ─────────────
  if (images.length === 0) {
    const readerM = html.match(/(?:id="readerarea"|class="[^"]*(?:reading-content|chapter-content|reader-area|read-img)[^"]*")[^>]*>([\s\S]*?)<\/div>/i);
    const searchArea = readerM ? readerM[1] : html;
    const imgReg = /(?:data-src|data-lazy-src|data-original|data-lazy|src)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"]*)?)"/gi;
    let im;
    while ((im = imgReg.exec(searchArea)) !== null) addImg(im[1]);
  }

  // ── METODE 4: Semua img tag di halaman (last resort) ────────────────────
  if (images.length === 0) {
    const imgReg = /(?:data-src|data-lazy-src|data-original|src)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"]*)?)"/gi;
    let im;
    while ((im = imgReg.exec(html)) !== null) addImg(im[1]);
  }

  // Prev/Next chapter
  const prevM = html.match(/href="([^"]+)"[^>]*(?:class|aria-label)="[^"]*(?:prev|previous|sebelum)[^"]*"/i)
             || html.match(/(?:prev|previous|sebelum)[^<]*<\/[^>]+>\s*(?:<[^>]+>)*\s*<a[^>]+href="([^"]+)"/i)
             || html.match(/<a[^>]+href="([^"]+)"[^>]*>\s*(?:&laquo;|←|‹|Prev|Previous|Sebelumnya)/i);

  const nextM = html.match(/href="([^"]+)"[^>]*(?:class|aria-label)="[^"]*(?:next|selanjut)[^"]*"/i)
             || html.match(/<a[^>]+href="([^"]+)"[^>]*>\s*(?:Next|Selanjutnya|›|→|&raquo;)/i);

  // URL balik ke series
  const seriesM = html.match(/href="(https?:\/\/[^"]+\/(?:manga|manhwa|manhua|komik|series)\/[^"\/]+\/)"/i);

  return {
    title,
    images,
    totalPages: images.length,
    prevChapter: prevM?.[1] || null,
    nextChapter: nextM?.[1] || null,
    seriesUrl  : seriesM?.[1] || null,
  };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  const url = req.query.url || "";
  if (!url || !url.startsWith("http")) return res.status(400).json({ ok:false, error:"URL tidak valid" });
  try {
    const html = await fetchHTML(url, {
      Referer: new URL(url).origin,
      // Beberapa situs cek header ini
      "X-Requested-With": "XMLHttpRequest",
    });
    const data = parseChapter(html, url);
    res.status(200).json({ ok:true, data });
  } catch(e) {
    res.status(500).json({ ok:false, error: e.message });
  }
};
