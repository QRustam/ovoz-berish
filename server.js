// Ovoz berish serveri — tashqi kutubxonasiz (faqat Node.js)
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PW = process.env.HOST_PASSWORD || "host123"; // Boshlovchi paroli

let S = { q: "", options: [], open: false, show: false, round: 0, votes: {} };
const clients = new Set();

function counts() {
  const c = S.options.map(() => 0);
  for (const k in S.votes) { const v = S.votes[k]; if (c[v] !== undefined) c[v]++; }
  return c;
}
function view(c) {
  const cs = counts();
  const total = cs.reduce((a, b) => a + b, 0);
  const v = {
    q: S.q, options: S.options, open: S.open, show: S.show, round: S.round, total,
    online: [...clients].filter(x => !x.host).length
  };
  if (c.host || S.show) v.counts = cs;
  if (!c.host) v.mine = S.votes[c.id] === undefined ? null : S.votes[c.id];
  return v;
}
function push() {
  for (const c of clients) c.res.write("data: " + JSON.stringify(view(c)) + "\n\n");
}
setInterval(() => { for (const c of clients) c.res.write(": ping\n\n"); }, 20000);

function body(req) {
  return new Promise(resolve => {
    let d = "";
    req.on("data", ch => { d += ch; if (d.length > 20000) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(d || "{}")); } catch (e) { resolve({}); } });
  });
}
function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}
function file(res, name) {
  fs.readFile(path.join(__dirname, name), (err, data) => {
    if (err) { res.writeHead(404); return res.end("Topilmadi"); }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");

  if (req.method === "GET" && url.pathname === "/") return file(res, "index.html");
  if (req.method === "GET" && url.pathname === "/host") return file(res, "host.html");

  if (req.method === "GET" && url.pathname === "/api/stream") {
    const host = url.searchParams.get("host") === PW;
    const id = String(url.searchParams.get("id") || "").slice(0, 64);
    res.writeHead(200, {
      "Content-Type": "text/event-stream", "Cache-Control": "no-cache",
      "Connection": "keep-alive", "X-Accel-Buffering": "no"
    });
    const c = { res, host, id };
    clients.add(c);
    res.write("data: " + JSON.stringify(view(c)) + "\n\n");
    push();
    req.on("close", () => { clients.delete(c); push(); });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth") {
    const b = await body(req);
    return json(res, b.pw === PW ? 200 : 401, { ok: b.pw === PW });
  }

  if (req.method === "POST" && url.pathname === "/api/vote") {
    const b = await body(req);
    const id = String(b.id || "").slice(0, 64);
    const ch = b.choice;
    if (!id || !S.open || !Number.isInteger(ch) || ch < 0 || ch >= S.options.length)
      return json(res, 400, { ok: false });
    if (!(id in S.votes) && Object.keys(S.votes).length >= 5000) return json(res, 400, { ok: false });
    S.votes[id] = ch;
    push();
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/host") {
    if (req.headers["x-host"] !== PW) return json(res, 401, { ok: false });
    const b = await body(req);
    if (b.action === "set") {
      const q = String(b.q || "").trim().slice(0, 300);
      const o = (Array.isArray(b.options) ? b.options : []).map(s => String(s).trim().slice(0, 120)).filter(Boolean).slice(0, 9);
      if (!q || o.length < 2) return json(res, 400, { ok: false });
      S = { q, options: o, open: true, show: false, round: S.round + 1, votes: {} };
    } else if (b.action === "open") S.open = !!b.value;
    else if (b.action === "show") S.show = !!b.value;
    else if (b.action === "reset") { S.votes = {}; S.round++; }
    else return json(res, 400, { ok: false });
    push();
    return json(res, 200, { ok: true });
  }

  res.writeHead(404); res.end("Topilmadi");
}).listen(PORT, () => console.log("Ovoz berish serveri: port " + PORT));
