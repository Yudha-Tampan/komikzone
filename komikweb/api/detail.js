const { fetchHTML, stripTags } = require("./_scraper");

function parseDetail(html, url) {
  const origin = new URL(url).origin;

  // Judul
  const titleM = html.match(/<h1[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/h1>/i)
              || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleM ? stripTags(titleM[1]).trim() : "Unknown";

  // Thumbnail — cari og:image dulu (paling reliable)
  const thumbM = html.match(/property="og:image"\s+content="([^"]+)"/i)
              || html.match(/name="og:image"\s+content="([^"]+)"/i)
              || html.match(/(?:data-src|data-lazy-src|src)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
  const thumbnail = thumbM ? thumbM[1] : "";

  // Sinopsis
  const synM = html.match(/itemprop="description"[^>]*>([\s\S]*?)<\/(?:div|p|span)>/i)
            || html.match(/class="[^"]*(?:sinopsis|synopsis|desc|entry-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  let synopsis = "-";
  if (synM) {
    const pM = synM[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    synopsis = pM ? stripTags(pM[1]).trim() : stripTags(synM[1]).trim().slice(0, 600);
  }
  if (synopsis === "-") {
    const ogM = html.match(/property="og:description"\s+content="([^"]+)"/i);
    if (ogM) synopsis = ogM[1];
  }

  // Info table (Author, Status, Type, dll)
  const info = {};
  // Pattern 1: table row
  const trReg = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trM;
  while ((trM = trReg.exec(html)) !== null) {
    const tds = [...trM[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];
    if (tds.length >= 2) {
      const k = stripTags(tds[0][1]).replace(/:/g,"").trim();
      const v = stripTags(tds[1][1]).trim();
      if (k && v && k.length < 30 && !info[k]) info[k] = v;
    }
  }
  // Pattern 2: span/div pairs
  const infoReg = /class="[^"]*(?:info-left|tsinfo|comic-info)[^"]*"[\s\S]*?(<\/div>){1,3}/i;
  const infoBlock = html.match(infoReg);
  if (infoBlock) {
    const bReg = /<b[^>]*>([\s\S]*?)<\/b>\s*:?\s*([\s\S]*?)(?=<b|<\/div>|<br)/gi;
    let bM;
    while ((bM = bReg.exec(infoBlock[0])) !== null) {
      const k = stripTags(bM[1]).trim();
      const v = stripTags(bM[2]).trim();
      if (k && v && !info[k]) info[k] = v;
    }
  }

  // Genre
  const genres = [...new Set(
    [...html.matchAll(/href="[^"]*\/(?:genre|genres|tag|tags)\/([^"\/]+)\/?"/gi)]
      .map(x => x[1].replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase()))
  )].filter(g => g.length > 1).slice(0, 12);

  // Rating
  const ratingM = html.match(/itemprop="ratingValue"[^>]*>([0-9.]+)/i)
               || html.match(/class="[^"]*rating[^"]*"[^>]*>([0-9.]+)/i);
  const rating = ratingM ? ratingM[1] : "-";

  // ── CHAPTERS ──────────────────────────────────────────────────────────────
  const chapters = [];
  const seenCh = new Set();

  // Pattern 1: WP Manga plugin — li.wp-manga-chapter
  const wpReg = /class="[^"]*wp-manga-chapter[^"]*"[^>]*>[\s\S]*?href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let wm;
  while ((wm = wpReg.exec(html)) !== null) {
    const u = wm[1];
    if (seenCh.has(u)) continue;
    seenCh.add(u);
    const label = stripTags(wm[2]).trim();
    const num = u.match(/chapter[- _]?([\d.]+)/i)?.[1] || label.match(/([\d.]+)/)?.[1] || "0";
    chapters.push({ label: label || `Chapter ${num}`, url: u, chNum: parseFloat(num)||0 });
  }

  // Pattern 2: link berteks "Chapter N" atau "Ch. N"
  if (chapters.length === 0) {
    const chReg = /href="(https?:\/\/[^"]+(?:chapter|ch)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let cm;
    while ((cm = chReg.exec(html)) !== null) {
      const u = cm[1];
      if (seenCh.has(u)) continue;
      seenCh.add(u);
      const label = stripTags(cm[2]).trim();
      if (!label || label.length > 60) continue;
      const num = u.match(/chapter[- _]?([\d.]+)/i)?.[1] || label.match(/([\d.]+)/)?.[1] || "0";
      chapters.push({ label, url: u, chNum: parseFloat(num)||0 });
    }
  }

  // Pattern 3: komiku — href ke /ch/ atau /read/
  if (chapters.length === 0) {
    const chReg2 = /href="(https?:\/\/[^"]+\/(?:ch|read|baca)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let cm2;
    while ((cm2 = chReg2.exec(html)) !== null) {
      const u = cm2[1];
      if (seenCh.has(u)) continue;
      seenCh.add(u);
      const label = stripTags(cm2[2]).trim();
      const num = label.match(/([\d.]+)/)?.[1] || "0";
      chapters.push({ label: label || `Chapter ${num}`, url: u, chNum: parseFloat(num)||0 });
    }
  }

  // Sort berurutan ascending (chapter 1 duluan)
  chapters.sort((a,b) => a.chNum - b.chNum);

  return { title, thumbnail, synopsis, info, genres, rating, chapters };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  const url = req.query.url || "";
  if (!url || !url.startsWith("http")) return res.status(400).json({ ok:false, error:"URL tidak valid" });
  try {
    const html = await fetchHTML(url, { Referer: new URL(url).origin });
    const data = parseDetail(html, url);
    res.status(200).json({ ok:true, data });
  } catch(e) {
    res.status(500).json({ ok:false, error: e.message });
  }
};
