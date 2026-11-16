/* SAF — conversion des documents Word (Web Manuals ou autres) en document de lecture EN/FR.
   Utilisé par le bloc « Documents compagnie » du portail. Nécessite JSZip (window.JSZip).
   API : SAFWord.read(fileList) -> [{base, data}]
         SAFWord.headings(files) -> titres du fichier principal (pour « premier titre »)
         SAFWord.convert(files, {code, start, fr}) -> {doc, imgs, keys}
         SAFWord.inline(result) -> objet document avec images intégrées (data: URI)   */
(function(){
"use strict";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const $ = id => document.getElementById(id);
const LIG = { "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl" };
const clean = t => { for (const [a, b] of Object.entries(LIG)) t = t.split(a).join(b); return t.replace(/\r/g, "").replace(/[ \t\u00a0]+/g, " ").replace(/ *\n */g, "\n").trim(); };
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const sha = async (alg, data) => hex(await crypto.subtle.digest(alg, typeof data === "string" ? new TextEncoder().encode(data) : data));
const key = async t => "t" + (await sha("SHA-1", t)).slice(0, 12);
const wa = (el, name) => el.getAttributeNS(W, name) ?? el.getAttribute("w:" + name);
const kids = (el, name) => [...el.children].filter(c => c.namespaceURI === W && c.localName === name);
const kid = (el, name) => kids(el, name)[0];
const desc = (el, ns, name) => [...el.getElementsByTagNameNS(ns, name)];


async function loadDocx(name, data) {
  const z = await JSZip.loadAsync(data);
  const xml = async p => { const f = z.file(p); return f ? new DOMParser().parseFromString((await f.async("string")).replace(/^\uFEFF/, ""), "application/xml") : null; };
  const doc = await xml("word/document.xml"), sty = await xml("word/styles.xml"), num = await xml("word/numbering.xml"), rels = await xml("word/_rels/document.xml.rels");
  const styles = {};
  if (sty) desc(sty, W, "style").forEach(s => { const n = kid(s, "name"); let nm = n ? wa(n, "val") : wa(s, "styleId"); const h = /^heading\s*(\d)$/i.exec(nm); if (h) nm = "Heading " + h[1]; styles[wa(s, "styleId")] = nm; });
  const styleNum = new Set();
  if (sty) desc(sty, W, "style").forEach(s => { const pr = kid(s, "pPr"); if (pr && kid(pr, "numPr")) styleNum.add(wa(s, "styleId")); });
  const numfmt = {};
  if (num) {
    const abs = {}; desc(num, W, "abstractNum").forEach(a => abs[wa(a, "abstractNumId")] = a);
    desc(num, W, "num").forEach(n => {
      const a = abs[wa(kid(n, "abstractNumId"), "val")]; if (!a) return;
      kids(a, "lvl").forEach(l => { const f = kid(l, "numFmt"); numfmt[wa(n, "numId") + ":" + wa(l, "ilvl")] = f ? wa(f, "val") : "bullet"; });
    });
  }
  const rel = {};
  if (rels) [...rels.getElementsByTagName("Relationship")].forEach(r => rel[r.getAttribute("Id")] = r.getAttribute("Target"));
  return { name, z, body: desc(doc, W, "body")[0], styles, styleNum, numfmt, rel };
}

function style(D, p) {
  const pr = kid(p, "pPr"), s = pr && kid(pr, "pStyle");
  return s ? (D.styles[wa(s, "val")] || "Normal") : "Normal";
}
function ptext(p) {
  const out = [];
  const walk = n => { for (const c of n.children) {
    if (c.namespaceURI === W && c.localName === "t") out.push(c.textContent);
    else if (c.namespaceURI === W && c.localName === "tab") out.push(" ");
    else if (c.namespaceURI === W && (c.localName === "br" || c.localName === "cr")) out.push("\n");
    else walk(c);
  } };
  walk(p); return clean(out.join(""));
}
function numbering(D, p) {
  const pr = kid(p, "pPr"), np = pr && kid(pr, "numPr"); if (!np) return null;
  const id = kid(np, "numId"); if (!id) return null;
  const nid = wa(id, "val"); if (nid === "0") return null;
  const lv = kid(np, "ilvl") ? wa(kid(np, "ilvl"), "val") : "0";
  return [nid, +lv, D.numfmt[nid + ":" + lv] || "bullet"];
}
function allBold(p) {
  const runs = desc(p, W, "r").filter(r => desc(r, W, "t").map(t => t.textContent).join("").trim());
  return runs.length > 0 && runs.every(r => { const pr = kid(r, "rPr"), b = pr && kid(pr, "b"); return b && !["0", "false"].includes(wa(b, "val")); });
}
async function images(D, el, store) {
  const out = [];
  for (const b of desc(el, A, "blip")) {
    const rid = b.getAttributeNS(R, "embed") || b.getAttribute("r:embed"); const tgt = D.rel[rid]; if (!tgt) continue;
    const path = tgt.startsWith("/") ? tgt.slice(1) : "word/" + tgt.replace(/^\.\//, "");
    const ext = path.split(".").pop().toLowerCase(); if (!["png", "jpg", "jpeg", "gif"].includes(ext)) continue;
    const f = D.z.file(path); if (!f) continue;
    const data = await f.async("uint8array"); const name = (await sha("SHA-1", data)).slice(0, 16) + "." + ext;
    store[name] = data; out.push(name);
  }
  return out;
}

async function convert(docxFiles, code, start, prevFr) {
  prevFr = prevFr || {};
  const isChap = n => /^\d+-\d+[\s_]+-[\s_]+/.test(n);
  const chapters = docxFiles.filter(f => isChap(f.base)).sort((a, b) => { const x = a.base.match(/(\d+)-(\d+)/), y = b.base.match(/(\d+)-(\d+)/); return x[1] - y[1] || x[2] - y[2]; });
  const mains = docxFiles.filter(f => !isChap(f.base));
  const segs = [], imgs = {}; let n = 0; const counters = [0, 0, 0, 0];
  const add = async s => { n++; s.id = `${code.toLowerCase()}-${String(n).padStart(4, "0")}`; if (s.en) s.k = await key(s.en); segs.push(s); return s; };
  const single = chapters.length === 0;          // document Word « ordinaire » (pas un export par chapitres)
  const hnum = (lvl, chap, auto) => { counters[lvl - 1]++; for (let i = lvl; i < 4; i++) counters[i] = 0;
    return (chap !== null || auto) ? counters.slice(0, lvl).join(".") : ""; };
  // un titre numéroté par Word (style ou paragraphe) reçoit son numéro ; un titre déjà numéroté dans le texte, non
  const autoNum = (D, p, t) => single && !/^\d+(\.\d+)*[.)]?\s/.test(t) &&
    (!!numbering(D, p) || (() => { const pr = kid(p, "pPr"), st = pr && kid(pr, "pStyle"); return st && D.styleNum.has(wa(st, "val")); })());

  async function walk(D, chap, started) {
    const olc = {}; let cover = chap !== null;
    for (const el of D.body.children) {
      if (el.namespaceURI !== W) continue;
      if (el.localName === "p") {
        const st = style(D, el), t = ptext(el);
        if (st.startsWith("Heading")) {
          const lvl = +st.split(" ").pop();
          if (!started && t !== start) continue; started = true;
          if (lvl === 1 && chap !== null) { counters.splice(0, 4, chap, 0, 0, 0); await add({ type: "h1", num: String(chap), en: t }); cover = false; continue; }
          cover = false; await add({ type: "h" + lvl, num: hnum(lvl, chap, autoNum(D, el, t)), en: t }); continue;
        }
        if (!started || cover) continue;
        for (const im of await images(D, el, imgs)) await add({ type: "img", src: im });
        if (!t || t.startsWith("(continued)")) continue;
        const nb = numbering(D, el);
        if (nb) {
          const [nid, lv, fmt] = nb, ordered = !["bullet", "none"].includes(fmt); let c = null;
          if (ordered) { const k = nid + ":" + lv; olc[k] = (olc[k] || 0) + 1; c = olc[k]; for (const kk of Object.keys(olc)) { const [a, b] = kk.split(":"); if (a === nid && +b > lv) delete olc[kk]; } }
          await add({ type: "li", lvl: lv, ol: c, en: t });
        } else if (allBold(el) && t.length < 120) await add({ type: "sub", en: t });
        else await add({ type: "p", en: t });
      } else if (el.localName === "tbl") {
        const rows = kids(el, "tr");
        if (rows.length === 1) {
          const cells = kids(rows[0], "tc");
          const hp = cells.length ? desc(cells[0], W, "p").filter(p => style(D, p).startsWith("Heading")) : [];
          if (hp.length) {
            const t = ptext(hp[0]), lvl = +style(D, hp[0]).split(" ").pop();
            if (!started && t !== start) continue; started = true; cover = false;
            const refs = cells.slice(1).flatMap(c => desc(c, W, "p").map(ptext)).join(" ").trim();
            await add({ type: "h" + lvl, num: hnum(lvl, chap, autoNum(D, hp[0], t)), en: t, refs }); continue;
          }
        }
        if (!started || cover) continue;
        const trows = [], vm = {};
        for (const r of rows) {
          const tr = []; let col = 0;
          for (const tc of kids(r, "tc")) {
            const pr = kid(tc, "tcPr"), gs = pr && kid(pr, "gridSpan"), span = gs ? +wa(gs, "val") : 1, v = pr && kid(pr, "vMerge");
            if (v && wa(v, "val") !== "restart" && vm[col]) { vm[col].rs = (vm[col].rs || 1) + 1; col += span; continue; }
            const paras = desc(tc, W, "p").map(q => { const tx = ptext(q), nb = numbering(D, q); return tx ? (nb && nb[2] === "bullet" ? "• " : "") + tx : ""; }).filter(Boolean);
            const cell = { en: paras.join("\n") }; if (cell.en) cell.k = await key(cell.en);
            if (span > 1) cell.cs = span;
            const im = await images(D, tc, imgs); if (im.length) cell.img = im;
            if (v) vm[col] = cell; else delete vm[col];
            tr.push(cell); col += span;
          }
          if (tr.some(c => c.en || c.img)) trows.push(tr);
        }
        if (trows.length) {
          const prev = segs[segs.length - 1];
          if (prev && prev.type === "table" && JSON.stringify(prev.rows[0].map(c => c.en)) === JSON.stringify(trows[0].map(c => c.en))) prev.rows.push(...trows.slice(1));
          else await add({ type: "table", rows: trows });
        }
      }
    }
    return started;
  }

  let started = !start;
  for (const m of mains) started = await walk(await loadDocx(m.base, m.data), null, started);
  for (const c of chapters) await walk(await loadDocx(c.base, c.data), +c.base.match(/^(\d+)/)[1], true);

  // métadonnées
  let title = mains.length ? mains[0].base.replace(/\.docx$/i, "") : code, issue = "";
  if (mains.length) { const D = await loadDocx(mains[0].base, mains[0].data);
    for (const p of desc(D.body, W, "p").slice(0, 60)) { const t = ptext(p); if (/^(Issue|Edition)\s/.test(t)) { issue = t; break; } } }
  const sorted = [...mains, ...chapters].map(f => f.base).sort();
  const all = new Uint8Array(docxFiles.reduce((s, f) => s + f.data.byteLength, 0)); let off = 0;
  for (const nm of sorted) { const f = docxFiles.find(x => x.base === nm); all.set(new Uint8Array(f.data), off); off += f.data.byteLength; }
  const keys = new Set(); segs.forEach(s => { s.k && keys.add(s.k); (s.rows || []).forEach(r => r.forEach(c => c.k && keys.add(c.k))); });
  const fr = {}; for (const [k, v] of Object.entries(prevFr)) if (keys.has(k)) fr[k] = v;
  return { doc: { code, title, issue, sources: sorted, sha256: await sha("SHA-256", all), segments: segs, fr }, imgs, keys };
}


async function read(list){
  const out = [];
  const put = f => { const i = out.findIndex(x => x.base === f.base); if (i >= 0) out.splice(i, 1); out.push(f); };
  for (const file of list) {
    if (/\.zip$/i.test(file.name)) {
      const z = await JSZip.loadAsync(await file.arrayBuffer());
      for (const ent of Object.values(z.files)) if (!ent.dir && /\.docx$/i.test(ent.name) && !/(^|\/)(~\$|__MACOSX)/.test(ent.name))
        put({ base: ent.name.split("/").pop(), data: await ent.async("arraybuffer") });
    } else if (/\.docx$/i.test(file.name)) put({ base: file.name, data: await file.arrayBuffer() });
  }
  const isChap = n => /^\d+-\d+[\s_]+-[\s_]+/.test(n);
  out.sort((a, b) => (isChap(a.base) - isChap(b.base)) || a.base.localeCompare(b.base, "fr", { numeric: true }));
  return out;
}
async function headings(files){
  const isChap = n => /^\d+-\d+[\s_]+-[\s_]+/.test(n);
  const first = files.find(f => !isChap(f.base)) || files[0]; if (!first) return { heads: [], issue: "", title: "" };
  const D = await loadDocx(first.base, first.data); const heads = []; let issue = "";
  for (const p of desc(D.body, W, "p")) { const t = ptext(p); if (style(D, p).startsWith("Heading")) heads.push(t); else if (!issue && /^(Issue|Edition)\s/.test(t)) issue = t; }
  return { heads, issue, title: first.base.replace(/\.docx$/i, "").replace(/^\d+-\d+[\s_]+-[\s_]+/, ""), webManuals: files.some(f => isChap(f.base)) };
}
const b64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
function inline(res){
  const uri = n => res.imgs[n] ? `data:image/${n.split(".").pop().replace("jpg", "jpeg")};base64,` + b64(res.imgs[n]) : n;
  const doc = JSON.parse(JSON.stringify(res.doc));
  doc.segments.forEach(s => { if (s.type === "img") s.src = uri(s.src); (s.rows || []).forEach(r => r.forEach(c => { if (c.img) c.img = c.img.map(uri); })); });
  return doc;
}
window.SAFWord = { read, headings, convert: (files, o) => convert(files, (o && o.code) || "DOC", (o && o.start) || "", (o && o.fr) || {}), inline };
})();
