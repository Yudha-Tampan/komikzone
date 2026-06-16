// Shared scraper utility - Komik Edition (v2 - improved)
const https = require("https");
const http = require("http");

function fetchHTML(url, extraHeaders = {}, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) return reject(new Error("Too many redirects: " + url));
    const mod = url.startsWith("https") ? https : http;
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "identity",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        ...extraHeaders,
      }
    };
    const req = mod.get(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let next = res.headers.location;
        if (!next.startsWith("http")) {
          next = `${parsed.protocol}//${parsed.hostname}${next}`;
        }
        return fetchHTML(next, extraHeaders, maxRedirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      }
      let data = "";
      res.setEncoding("utf8");
      res.on("data", c => data += c);
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error("Timeout: " + url)); });
  });
}

function stripTags(str) {
  if (!str) return "";
  return str.replace(/<[^>]+>/g, "").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&nbsp;/g," ").replace(/\s+/g, " ").trim();
}

// Ekstrak semua img dari suatu blok HTML (data-src, data-lazy, src)
function extractImages(html, filterFn) {
  const seen = new Set();
  const imgs = [];
  const reg = /(?:data-src|data-lazy|data-original|data-url|src)\s*=\s*["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"']*)?)['"]/gi;
  let m;
  while ((m = reg.exec(html)) !== null) {
    const u = m[1];
    if (seen.has(u)) continue;
    if (filterFn && !filterFn(u)) continue;
    seen.add(u);
    imgs.push(u);
  }
  return imgs;
}

module.exports = { fetchHTML, stripTags, extractImages };
