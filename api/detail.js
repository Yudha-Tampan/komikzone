const { fetchHTML, stripTags } = require("./_scraper");

function parseKomikuDetail(html, url) {
  // ── Judul ──────────────────────────────────────────────────────────────────
  // Komiku: judul di h1.entry-title atau h1 biasa, bersihkan suffix situs
  const titleM = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([^<]+)<\/h1>/i)
              || html.match(/<h1[^>]*itemprop="name"[^>]*>([^<]+)<\/h1>/i)
              || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  let title = titleM ? stripTags(titleM[1]) : "Unknown";
  // Bersihkan suffix situs
  title = title.replace(/\s*[-|]\s*(?:Komiku|ManhwaLand|Manhwa Land|Baca Komik Online)[^$]*/i, "").trim();
  // Fallback: OG title
  if (!title || title === "Unknown") {
    const ogM = html.match(/property="og:title"\s+content="([^"]+)"/i)
             || html.match(/name="og:title"\s+content="([^"]+)"/i);
    if (ogM) title = ogM[1].replace(/\s*[-|]\s*(?:Komiku|ManhwaLand)[^$]*/i,"").trim();
  }

  // ── Thumbnail ──────────────────────────────────────────────────────────────
  const thumbM = html.match(/property="og:image"\s+content="([^"]+)"/i)
              || html.match(/name="og:image"\s+content="([^"]+)"/i)
              || html.match(/class="[^"]*(?:thumb|poster|cover|komik-img|comic-thumbnail)[^"]*"[\s\S]*?(?:data-src|src)="([^"]+)"/i);
  const thumbnail = thumbM ? thumbM[1] : "";

  // ── Sinopsis ───────────────────────────────────────────────────────────────
  // Komiku: div.entry-content atau div[itemprop="description"]
  const synSelectors = [
    /itemprop="description"[^>]*>([\s\S]*?)<\/(?:div|section|p)>/i,
    /class="[^"]*(?:entry-content|sinopsis|synopsis|desc|deskripsi)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /id="[^"]*(?:sinopsis|synopsis|desc)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];
  let synopsis = "-";
  for (const sel of synSelectors) {
    const m = html.match(sel);
    if (m) {
      // Ambil semua paragraf
      const ps = [...m[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(x => stripTags(x[1])).filter(s => s.length > 10);
      if (ps.length > 0) { synopsis = ps.join(" "); break; }
      const txt = stripTags(m[1]).trim();
      if (txt.length > 20) { synopsis = txt.slice(0, 800); break; }
    }
  }
  if (synopsis === "-") {
    const ogDescM = html.match(/property="og:description"\s+content="([^"]+)"/i);
    if (ogDescM) synopsis = ogDescM[1];
  }

  // ── Info Table ─────────────────────────────────────────────────────────────
  const info = {};
  // Pattern 1: td/tr table format (komiku)
  const trReg = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trM;
  while ((trM = trReg.exec(html)) !== null) {
    const tdM = [...trM[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (tdM.length >= 2) {
      const k = stripTags(tdM[0][1]).replace(/:$/,"").trim();
      const v = stripTags(tdM[1][1]).trim();
      if (k && v && k.length < 40 && v.length < 200 && !info[k]) info[k] = v;
    }
  }
  // Pattern 2: span/div label:value
  const infoReg2 = /<(?:span|div)[^>]*class="[^"]*(?:info|detail|meta)[^"]*"[^>]*>([^<]+)\s*:\s*<\/[^>]+>\s*<(?:span|div|a)[^>]*>([^<]+)/gi;
  let im2;
  while ((im2 = infoReg2.exec(html)) !== null) {
    const k = im2[1].trim();
    const v = im2[2].trim();
    if (k && v && !info[k]) info[k] = v;
  }
  // Pattern 3: <b>key:</b> value
  const infoReg3 = /<(?:b|strong)[^>]*>([^<:]+):?\s*<\/(?:b|strong)>\s*:?\s*([^<\n]{1,100})/gi;
  let im3;
  while ((im3 = infoReg3.exec(html)) !== null) {
    const k = im3[1].trim();
    const v = stripTags(im3[2]).trim();
    if (k && v && k.length < 40 && v.length < 200 && !info[k]) info[k] = v;
  }

  // ── Genre ──────────────────────────────────────────────────────────────────
  const genres = [...new Set(
    [...html.matchAll(/href="[^"]*\/(?:genre|genres|tag|tags|category)\/([^"\/]+)\/?"\s*[^>]*>([^<]+)/gi)]
      .map(x => stripTags(x[2]).trim())
      .filter(g => g.length > 1 && g.length < 40)
  )];

  // ── Rating ─────────────────────────────────────────────────────────────────
  const ratingM = html.match(/itemprop="ratingValue"[^>]*>([0-9.]+)/i)
               || html.match(/class="[^"]*(?:rating-value|score)[^"]*"[^>]*>([0-9.]+)/i)
               || html.match(/average[^>]*>([0-9.]+)/i);
  const rating = ratingM ? ratingM[1] : "-";

  // ── Chapters ───────────────────────────────────────────────────────────────
  const chapters = [];
  const seenCh = new Set();
  const baseHostname = (() => { try { return new URL(url).hostname; } catch { return ""; } })();

  // Pattern 1: Komiku - li atau div dengan link chapter
  // Komiku chapter URL: /chapter-XXX/ atau /chapter/XXX/
  const chRegPatterns = [
    // URL mengandung "chapter" dengan angka
    /href="(https?:\/\/[^"]*(?:komiku|manhwaland|manhwa)[^"]*\/[^"]*chapter[^"\/]*\/[^"]*)"/gi,
    // Fallback: semua link di area chapter list
    /href="(https?:\/\/[^"]+\/(?:chapter|ch)-?[\d.]+[^"]*)"/gi,
  ];

  // Cari area chapter list dulu
  const chListAreaM = html.match(/<(?:div|ul|section)[^>]*(?:id|class)="[^"]*(?:chapter[_-]?list|chapterlist|list[_-]?chapter|daftar[_-]?chapter)[^"]*"[^>]*>([\s\S]*?)(?=<\/(?:div|ul|section)>[^<]*<\/(?:div|ul|section)>|<footer|<div[^>]*class="[^"]*(?:related|sidebar))/i);
  const chSearchArea = chListAreaM ? chListAreaM[1] : html;

  // Ekstrak chapter dari area tersebut
  const chFull = /href="(https?:\/\/[^"]+)"[^>]*>([\s\S]{0,200}?)<\/a>/gi;
  let cm;
  while ((cm = chFull.exec(chSearchArea)) !== null) {
    const u = cm[1];
    const label = stripTags(cm[2]).trim();
    
    // Harus mengandung "chapter" atau "ch" dalam URL atau label
    const isChapter = /chapter|ch[.-]?\d/i.test(u) || /chapter\s*[\d.]+/i.test(label);
    if (!isChapter) continue;
    
    // Filter: harus dari host yang sama atau host sumber
    try {
      const chHost = new URL(u).hostname;
      if (baseHostname && chHost !== baseHostname && !chHost.includes("komiku") && !chHost.includes("manhwaland")) continue;
    } catch { continue; }
    
    if (seenCh.has(u)) continue;
    seenCh.add(u);

    // Ekstrak nomor chapter
    const chNum = u.match(/chapter[- _]?([\d.]+)/i)?.[1]
               || label.match(/chapter\s*([\d.]+)/i)?.[1]
               || label.match(/ch\.?\s*([\d.]+)/i)?.[1]
               || label.match(/^([\d.]+)$/)?.[1]
               || "0";
    
    const cleanLabel = label || `Chapter ${chNum}`;
    chapters.push({ label: cleanLabel, url: u, chNum: parseFloat(chNum) || 0 });
  }

  // Fallback jika masih kosong - pattern lebih longgar
  if (chapters.length === 0) {
    const chReg2 = /href="(https?:\/\/[^"]+)"[^>]*>\s*(?:Chapter|Ch\.?)\s*([\d.]+)/gi;
    while ((cm = chReg2.exec(html)) !== null) {
      const u = cm[1];
      if (seenCh.has(u)) continue;
      seenCh.add(u);
      chapters.push({ label: `Chapter ${cm[2]}`, url: u, chNum: parseFloat(cm[2]) || 0 });
    }
  }

  // Sort ascending berdasarkan nomor chapter (terlama dulu)
  chapters.sort((a, b) => a.chNum - b.chNum);

  return { title, thumbnail, synopsis, info, genres, rating, chapters };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  const url = (req.query.url || "").trim();
  if (!url || !url.startsWith("http")) return res.status(400).json({ ok: false, error: "URL tidak valid" });
  try {
    const origin = (() => { try { const u = new URL(url); return u.origin; } catch { return ""; } })();
    const html = await fetchHTML(url, { Referer: origin });
    const data = parseKomikuDetail(html, url);
    if (!data.title || data.title === "Unknown") {
      return res.status(200).json({ ok: false, error: "Gagal parse detail. Coba buka langsung: " + url });
    }
    res.status(200).json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
