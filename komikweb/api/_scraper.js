// Shared scraper utility — pakai native fetch (Node 18+, Vercel ready)

async function fetchHTML(url, extraHeaders = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        ...extraHeaders,
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function stripTags(str = "") {
  return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

module.exports = { fetchHTML, stripTags };
