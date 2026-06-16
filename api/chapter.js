const { fetchHTML, stripTags } = require("./_scraper");

function parseChapter(html, pageUrl) {
  const hostname = (() => { try { return new URL(pageUrl).hostname; } catch { return ""; } })();

  // ── Judul chapter ──────────────────────────────────────────────────────────
  const titleM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleM ? stripTags(titleM[1]).replace(/\s*[-|]\s*(?:Komiku|ManhwaLand)[^$]*/i,"").trim() : "Chapter";

  // ── Ekstrak gambar ─────────────────────────────────────────────────────────
  const images = [];
  const seen = new Set();

  function addImg(u) {
    if (!u || seen.has(u)) return;
    if (/logo|icon|banner|ads|pixel|gravatar|favicon|avatar|emoji|wp-content\/themes/i.test(u)) return;
    // Pastikan ini gambar komik (bukan thumbnail kecil)
    // Komiku dan manhwaland biasanya host di CDN mereka sendiri
    seen.add(u);
    images.push(u);
  }

  // ── Pattern 1: ts_reader.run({...}) ── paling umum di WP Manga plugin ──────
  const tsM = html.match(/ts_reader\.run\(([\s\S]*?)\);/i);
  if (tsM) {
    // Ekstrak semua URL gambar dari JSON ts_reader
    const imgMatches = [...tsM[1].matchAll(/"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"]*)?)"/gi)];
    imgMatches.forEach(m => addImg(m[1]));
  }

  // ── Pattern 2: JSON di window.chapterData atau variable lain ───────────────
  if (images.length === 0) {
    const jsonVarM = html.match(/(?:chapter_data|chapterImages|imagesList)\s*=\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*;/i);
    if (jsonVarM) {
      const imgMatches = [...jsonVarM[1].matchAll(/"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi)];
      imgMatches.forEach(m => addImg(m[1]));
    }
  }

  // ── Pattern 3: "pages": [...] dalam script ─────────────────────────────────
  if (images.length === 0) {
    const pagesM = html.match(/"pages"\s*:\s*\[([\s\S]*?)\]/i);
    if (pagesM) {
      const urlsM = [...pagesM[1].matchAll(/"(?:url|src|link)"\s*:\s*"([^"]+)"/gi)];
      urlsM.forEach(m => addImg(m[1]));
    }
  }

  // ── Pattern 4: Cari di reader area (div#readerarea, .reading-content, dll) ─
  if (images.length === 0) {
    // Isolasi area baca - biasanya ada id/class tertentu
    const readerPatterns = [
      /id="readerarea"[^>]*>([\s\S]*?)(?=<\/div>\s*<\/div>|<div[^>]*class="[^"]*(?:nav|related|comment))/i,
      /class="[^"]*reading-content[^"]*"[^>]*>([\s\S]*?)(?=<\/div>\s*<\/div>)/i,
      /class="[^"]*chapter-content[^"]*"[^>]*>([\s\S]*?)(?=<\/div>)/i,
      /class="[^"]*reader-area[^"]*"[^>]*>([\s\S]*?)(?=<\/div>)/i,
      /id="komik_wrap"[^>]*>([\s\S]*?)(?=<\/div>)/i,
    ];
    
    let readerHTML = "";
    for (const pat of readerPatterns) {
      const m = html.match(pat);
      if (m) { readerHTML = m[1]; break; }
    }
    if (!readerHTML) readerHTML = html; // fallback ke seluruh HTML

    const imgReg = /(?:data-src|data-lazy|data-original|data-url|src)\s*=\s*["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"']*)?)['"]/gi;
    let im;
    while ((im = imgReg.exec(readerHTML)) !== null) {
      addImg(im[1]);
    }
  }

  // ── Pattern 5: Manhwaland sering embed di noscript ─────────────────────────
  if (images.length < 3) {
    const noscriptM = html.match(/<noscript>([\s\S]*?)<\/noscript>/gi);
    if (noscriptM) {
      for (const ns of noscriptM) {
        const imgM = [...ns.matchAll(/src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"']*)"/gi)];
        imgM.forEach(m => addImg(m[1]));
      }
    }
  }

  // ── Pattern 6: Fallback scan seluruh HTML, filter ketat ───────────────────
  if (images.length === 0) {
    const allImgReg = /(?:data-src|data-lazy|data-original|src)\s*=\s*["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)['"]/gi;
    let m;
    const candidates = [];
    while ((m = allImgReg.exec(html)) !== null) {
      const u = m[1];
      if (/logo|icon|banner|ads|pixel|gravatar|favicon|avatar|emoji|themes/i.test(u)) continue;
      // Gambar komik biasanya agak besar ukurannya dalam URL (mengandung angka halaman)
      if (/\d+\.(jpg|jpeg|png|webp)/i.test(u)) candidates.push(u);
    }
    candidates.forEach(addImg);
  }

  // ── Prev / Next chapter ────────────────────────────────────────────────────
  // Pattern yang lebih komprehensif
  const prevPatterns = [
    /href="([^"]+)"[^>]*>\s*(?:&laquo;|←|‹|Prev|Previous|Sebelumnya|Chapter Sebelumnya|Bab Sebelumnya)[^<]*/i,
    /class="[^"]*prev[^"]*"[^>]*href="([^"]+)"/i,
    /href="([^"]+)"[^>]*class="[^"]*prev[^"]*"/i,
    /"prevChapter"\s*:\s*"([^"]+)"/i,
  ];
  const nextPatterns = [
    /href="([^"]+)"[^>]*>\s*(?:Next|→|›|&raquo;|Selanjutnya|Chapter Selanjutnya|Bab Selanjutnya)[^<]*/i,
    /class="[^"]*next[^"]*"[^>]*href="([^"]+)"/i,
    /href="([^"]+)"[^>]*class="[^"]*next[^"]*"/i,
    /"nextChapter"\s*:\s*"([^"]+)"/i,
  ];

  let prevChapter = null, nextChapter = null;
  for (const pat of prevPatterns) {
    const m = html.match(pat);
    if (m && m[1] !== "#" && m[1] !== "javascript:void(0)") { prevChapter = m[1]; break; }
  }
  for (const pat of nextPatterns) {
    const m = html.match(pat);
    if (m && m[1] !== "#" && m[1] !== "javascript:void(0)") { nextChapter = m[1]; break; }
  }

  // ── Link seri ──────────────────────────────────────────────────────────────
  const seriesM = html.match(/href="(https?:\/\/[^"]*\/(?:manga|manhwa|manhua|komik|series)\/[^"\/]+\/?)"[^>]*>\s*[^<]*(?:Daftar|List|All|Kembali|Back|Series|Seri)[^<]*/i)
                || html.match(/class="[^"]*allchapters[^"]*"[^>]*href="([^"]+)"/i);

  return {
    title,
    images,
    totalPages: images.length,
    prevChapter,
    nextChapter,
    seriesUrl: seriesM?.[1] || null,
  };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  const url = (req.query.url || "").trim();
  if (!url || !url.startsWith("http")) return res.status(400).json({ ok: false, error: "URL tidak valid" });
  try {
    const origin = (() => { try { const u = new URL(url); return u.origin; } catch { return ""; } })();
    // Komiku dan manhwaland butuh Referer yang tepat
    const html = await fetchHTML(url, {
      Referer: origin,
      "X-Requested-With": "XMLHttpRequest",
    });
    const data = parseChapter(html, url);
    res.status(200).json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
