// domain_search 工具：垂直领域源直查（版本/包、学术、安全），对标 free-search-mcp 的领域引擎层（移植方案 P3-1/2/3）。
// 全部免 key 公开 JSON API；httpsJson / htmlToText 取自 fetch_upstream.js（与 #63 fetch 链同源，不依赖 research.js）。
// ponytail: 一个工具 + 引擎注册表，而非每源一工具；引擎的 claims 式自判先不做——agent 从 description 里挑引擎。

import { defineTool } from "@deepseek-ai/dsh-tools";
import { httpsJson, htmlToText } from "./fetch_upstream.js";
import { stripLoneSurrogates } from "./safe_text.js";
import { promptLanguageOf, toolDescription, toolParam, localizedEffect } from "./prompt_i18n.js";

const UA = { "User-Agent": "dsh-free-search/0.8 (plugin)", Accept: "application/json" };

async function getJson(url, headers = UA) {
  const r = await httpsJson("GET", url, { headers, timeoutMs: 20000 });
  if (r.status !== 200) throw new Error(`HTTP ${r.status} from ${new URL(url).hostname}`);
  return JSON.parse(r.text);
}

const src = (url, title, snippet, publishedAt) => ({ url, title: title || url, snippet: String(snippet || "").slice(0, 280), publishedAt: publishedAt || "" });
const day = (v) => (v ? String(v).slice(0, 10) : "");

// ---------------- P3-1 版本 / 包 ----------------

const pypi = {
  desc: "Python PyPI package: latest version and summary (exact name)",
  async run(q) {
    const name = q.trim().split(/\s+/).pop();
    const d = await getJson(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
    return [src(`https://pypi.org/project/${name}`, `${name} ${d.info.version} on PyPI`, `${d.info.summary || ""} · python: ${d.info.requires_python || "?"}`, d.info.version ? undefined : "")];
  },
};

const crates = {
  desc: "Rust crates.io package: latest version and description (exact name)",
  async run(q) {
    const name = q.trim().split(/\s+/).pop();
    const d = await getJson(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}`);
    const c = d.crate;
    return [src(`https://crates.io/crates/${name}`, `${c.name} ${c.max_stable_version || c.max_version} on crates.io`, `${c.description || ""} · downloads ${c.downloads}`, day(c.updated_at))];
  },
};

const githubReleases = {
  desc: "GitHub latest release of owner/repo (tag, date, notes)",
  async run(q) {
    const m = q.match(/([\w.-]+)\/([\w.-]+)/);
    if (!m) throw new Error("query must contain owner/repo");
    const d = await getJson(`https://api.github.com/repos/${m[1]}/${m[2]}/releases/latest`);
    return [src(d.html_url, `${m[1]}/${m[2]} ${d.tag_name}`, String(d.body || "").slice(0, 280), day(d.published_at))];
  },
};

const endoflife = {
  desc: "endoflife.date: support/EOL cycles of a product (e.g. nodejs, ubuntu, python)",
  async run(q) {
    const p = q.trim().split(/\s+/).pop().toLowerCase();
    const arr = await getJson(`https://endoflife.date/api/${encodeURIComponent(p)}.json`);
    const today = new Date().toISOString().slice(0, 10);
    return arr.filter((c) => c.eol === false || (typeof c.eol === "string" && c.eol.slice(0, 10) > today)).slice(0, 3)
      .map((c) => src(`https://endoflife.date/${p}`, `${p} ${c.cycle}`, `released ${c.release_date || "?"} · EOL ${c.eol === false ? "not yet" : c.eol}`, c.release_date));
  },
};

// registries：Maven/RubyGems/Go/Homebrew/Docker/Packagist/NuGet 七源一引擎（对标 free-search-mcp registries.py）
const REG_HINTS = [
  ["maven", /maven|gradle|java|kotlin/i], ["rubygems", /ruby|gem\b/i], ["go", /\bgo\b|golang/i],
  ["brew", /brew|homebrew/i], ["docker", /docker|image|容器/i], ["packagist", /packagist|composer|php/i], ["nuget", /nuget|dotnet|\.net|c#/i],
];
const REG_STOP = new Set(["maven", "gradle", "java", "kotlin", "ruby", "gem", "gems", "go", "golang", "brew", "homebrew", "formula", "docker", "dockerhub", "image", "container", "容器", "packagist", "composer", "php", "nuget", "dotnet", "net", "c#", "csharp", "latest", "version", "版本", "查询", "search"]);
const GO_MOD = /\b((?:github\.com|gitlab\.com|golang\.org|google\.golang\.org|k8s\.io)\/[\w./-]+)/;

const registries = {
  desc: "Package registry version+date: Maven, RubyGems, Go module, Homebrew, Docker Hub, Packagist, NuGet — name the ecosystem in the query (e.g. 'maven commons-lang3', 'rubygems rails', 'go github.com/gin-gonic/gin', 'docker nginx')",
  async run(q) {
    const hint = REG_HINTS.find(([, re]) => re.test(q))?.[0];
    const words = q.trim().split(/\s+/).filter((w) => !REG_STOP.has(w.toLowerCase()));
    const name = words[words.length - 1] || "";
    const goMod = GO_MOD.exec(q)?.[1];
    if (!hint || (!name && !goMod)) throw new Error("name an ecosystem (maven/rubygems/go/brew/docker/packagist/nuget) and a package name");
    const enc = encodeURIComponent;
    if (hint === "maven" && name) {
      const d = await getJson(`https://search.maven.org/solrsearch/select?q=${enc(name)}&rows=3&wt=json`);
      const docs = d.response?.docs || [];
      if (!docs.length) return [];
      return [src(`https://central.sonatype.com/artifact/${docs[0].g}/${docs[0].a}`, `${docs[0].g}:${docs[0].a} ${docs[0].latestVersion} on Maven Central`, `${docs[0].versionCount} versions published`, day(docs[0].timestamp ? new Date(docs[0].timestamp).toISOString() : ""))];
    }
    if (hint === "rubygems" && name) {
      const g = await getJson(`https://rubygems.org/api/v1/gems/${enc(name)}.json`);
      return [src(`https://rubygems.org/gems/${name}`, `${g.name} ${g.version} on RubyGems`, g.info || "", day(g.version_created_at))];
    }
    if (hint === "go" && goMod) {
      const escaped = goMod.replace(/[A-Z]/g, (c) => "!" + c.toLowerCase()).replace(/\/+$/, "");
      const d = await getJson(`https://proxy.golang.org/${enc(escaped).replace(/%2F/gi, "/").replace(/%21/gi, "!")}/@latest`);
      return [src(`https://pkg.go.dev/${goMod}@${d.Version}`, `${goMod} ${d.Version} (Go module)`, "latest tag", day(d.Time))];
    }
    if (hint === "brew" && name) {
      const f = await getJson(`https://formulae.brew.sh/api/formula/${enc(name)}.json`);
      return [src(`https://formulae.brew.sh/formula/${name}`, `${f.name} ${f.versions.stable} on Homebrew`, `${f.desc || ""} · license ${f.license || "?"}`, "")];
    }
    if (hint === "docker" && name) {
      const [ns0, ...rest] = name.split("/");
      const ns = rest.length ? ns0 : "library";
      const repo = rest.length ? rest.join("/") : ns0;
      const d = await getJson(`https://hub.docker.com/v2/repositories/${enc(ns)}/${enc(repo)}`);
      return [src(`https://hub.docker.com/r/${ns}/${repo}`, `${d.name || repo} on Docker Hub`, `${(d.description || "").slice(0, 200)} · ${d.pull_count?.toLocaleString?.() || "?"} pulls`, day(d.last_updated))];
    }
    if (hint === "packagist" && name.includes("/")) {
      const [v, n] = name.toLowerCase().split("/");
      const d = await getJson(`https://repo.packagist.org/p2/${enc(v)}/${enc(n)}.json`);
      const top = d.packages?.[`${v}/${n}`]?.[0];
      if (!top) return [];
      return [src(`https://packagist.org/packages/${v}/${n}`, `${v}/${n} ${top.version} on Packagist`, top.description || "", day(top.time))];
    }
    if (hint === "nuget" && name) {
      const d = await getJson(`https://azuresearch-usnc.nuget.org/query?q=${enc(name)}&take=3`);
      return (d.data || []).slice(0, 2).map((p) => src(`https://www.nuget.org/packages/${p.id}/${p.version}`, `${p.id} ${p.version} on NuGet`, p.description || "", ""));
    }
    return [];
  },
};

// ---------------- P3-2 学术 ----------------

const crossref = {
  desc: "Crossref: scholarly works by keyword (title, DOI, year)",
  async run(q) {
    const d = await getJson(`https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=3&select=DOI,title,issued`);
    return (d.message?.items || []).map((it) => src(`https://doi.org/${it.DOI}`, it.title?.[0] || it.DOI, `DOI ${it.DOI}`, day(it.issued?.["date-parts"]?.[0]?.[0])));
  },
};

const openalex = {
  desc: "OpenAlex: papers by keyword (open catalog of scholarly works)",
  async run(q) {
    const d = await getJson(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=3`);
    return (d.results || []).map((w) => src(w.doi || w.id, w.display_name, (w.abstract_inverted_index ? "abstract available" : "") + ` · cited_by ${w.cited_by_count}`, w.publication_year ? `${w.publication_year}` : ""));
  },
};

const s2 = {
  desc: "Semantic Scholar: papers by keyword with abstracts (shared rate limit)",
  async run(q) {
    const d = await getJson(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=3&fields=title,year,url,abstract`);
    return (d.data || []).map((p) => src(p.url, p.title, (p.abstract || "").slice(0, 260), p.year ? String(p.year) : ""));
  },
};

const arxiv = {
  desc: "arXiv preprints by keyword",
  async run(q) {
    // ponytail: Atom XML 用正则切（结构规整）；要更稳再上解析器
    const r = await httpsJson("GET", `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&max_results=3`, { headers: UA, timeoutMs: 25000 });
    if (r.status !== 200) throw new Error(`arXiv HTTP ${r.status}`);
    const entries = [...r.text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([e]) => {
      const pick = (t) => { const m = e.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? m[1].replace(/\s+/g, " ").trim() : ""; };
      return src(pick("id"), pick("title"), pick("summary").slice(0, 260), day(pick("published")));
    });
    return entries;
  },
};

// ---------------- P3-3 安全 ----------------

const nvd = {
  desc: "NVD CVE keyword search (recent CVEs matching a product/name)",
  async run(q) {
    const d = await getJson(`https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(q)}&resultsPerPage=3`);
    return (d.vulnerabilities || []).map(({ cve }) => src(`https://nvd.nist.gov/vuln/detail/${cve.id}`, `${cve.id}: ${(cve.descriptions?.find((x) => x.lang === "en") || cve.descriptions?.[0])?.value?.slice(0, 160) || cve.id}`, (cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore != null ? `CVSS ${cve.metrics.cvssMetricV31[0].cvssData.baseScore} · ` : "") + (cve.url || ""), day(cve.published)));
  },
};

const osv = {
  desc: "OSV.dev vulnerabilities for a package — query starts with an ecosystem: 'npm lodash', 'pypi requests', 'go github.com/gin-gonic/gin', 'maven org.apache.logging.log4j:log4j-core'",
  async run(q) {
    const ECOS = { npm: "npm", pypi: "PyPI", py: "PyPI", go: "Go", rust: "crates.io", crates: "crates.io", maven: "Maven", java: "Maven", ruby: "RubyGems", gem: "RubyGems", rubygems: "RubyGems", nuget: "NuGet", dotnet: "NuGet", php: "Packagist", composer: "Packagist" };
    const tokens = q.trim().split(/\s+/);
    const eco = ECOS[tokens[0]?.toLowerCase()];
    if (!eco) throw new Error(`start with an ecosystem (${Object.keys(ECOS).slice(0, 8).join("/")}…), e.g. 'npm lodash'`);
    const name = tokens.slice(1).join(" ");
    const r = await httpsJson("POST", "https://api.osv.dev/v1/query", { headers: { ...UA, "Content-Type": "application/json" }, body: JSON.stringify({ package: { ecosystem: eco, name } }), timeoutMs: 20000 });
    if (r.status !== 200) throw new Error(`OSV HTTP ${r.status}`);
    const d = JSON.parse(r.text);
    return (d.vulns || []).slice(0, 3).map((v) => src(`https://osv.dev/vulnerability/${v.id}`, `${v.id}${v.aliases?.length ? ` (${v.aliases.slice(0, 2).join(", ")})` : ""}`, (v.summary || "").slice(0, 260), day(v.modified)));
  },
};

// ---------------- P3-1 补：huggingface ----------------

const huggingface = {
  desc: "Hugging Face models by keyword (downloads, likes, last update)",
  async run(q) {
    const d = await getJson(`https://huggingface.co/api/models?search=${encodeURIComponent(q)}&limit=3`);
    return (d || []).map((m) => src(`https://huggingface.co/${m.modelId}`, m.modelId, `${m.pipeline_tag || "model"} · downloads ${m.downloads?.toLocaleString?.() || "?"} · likes ${m.likes ?? "?"}`, day(m.lastModified)));
  },
};

// ---------------- P3-2 学术（补） ----------------

const pubmed = {
  desc: "PubMed biomedical literature by keyword (two-step: esearch + esummary)",
  async run(q) {
    const s = await getJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=3&term=${encodeURIComponent(q)}`);
    const ids = s.esearchresult?.idlist || [];
    if (!ids.length) return [];
    const d = await getJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`);
    return ids.map((pmid) => { const r = d.result?.[pmid] || {}; return src(`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`, r.title || pmid, `${r.source || ""} · ${r.pubdate || ""}`.trim(), ""); });
  },
};

const europepmc = {
  desc: "Europe PMC: life-science literature by keyword (incl. preprints)",
  async run(q) {
    const d = await getJson(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&format=json&pageSize=3`);
    return (d.resultList?.result || []).map((r) => src(r.doi ? `https://doi.org/${r.doi}` : `https://europepmc.org/article/${r.source}/${r.id}`, r.title, `${r.authorString || ""} · ${r.journalTitle || r.source || ""} · ${r.pubYear || ""}`, r.firstPublicationDate || ""));
  },
};

const dblp = {
  desc: "dblp: computer science bibliography by keyword",
  async run(q) {
    const d = await getJson(`https://dblp.org/search/publ/api?q=${encodeURIComponent(q)}&format=json&h=3`);
    const hits = d.result?.hits?.hit || [];
    return hits.map((h) => { const i = h.info || {}; return src(i.url || "https://dblp.org", i.title || "", `${i.venue || ""} ${i.year || ""}`.trim(), i.year ? String(i.year) : ""); });
  },
};

const zenodo = {
  desc: "Zenodo: research data repositories by keyword",
  async run(q) {
    const d = await getJson(`https://zenodo.org/api/records?q=${encodeURIComponent(q)}&size=3`);
    return (d.hits?.hits || []).map((h) => src(`https://zenodo.org/records/${h.id}`, h.metadata?.title || String(h.id), htmlToText(h.metadata?.description || "").slice(0, 240), day(h.metadata?.publication_date)));
  },
};

const doaj = {
  desc: "DOAJ: Directory of Open Access Journals articles",
  async run(q) {
    const d = await getJson(`https://doaj.org/api/search/articles/${encodeURIComponent(q)}?pageSize=3`);
    return (d.results || []).map((r) => { const b = r.bibjson || {}; return src((b.link || [])[0]?.url || "https://doaj.org", b.title || "", `${b.journal?.title || ""} · ${b.year || ""}`.trim(), b.year || ""); });
  },
};

// ---------------- P3-3 补：cisakev ----------------

// ponytail: KEV 目录 ~4MB，模块级 memo 24h——无后台任务，进程内只拉一次
let _kevCache = { at: 0, vulns: [] };
const cisakev = {
  desc: "CISA Known Exploited Vulnerabilities catalog by keyword (CVE id / vendor / product)",
  async run(q) {
    if (Date.now() - _kevCache.at > 24 * 3600 * 1000) {
      const d = await getJson("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json");
      _kevCache = { at: Date.now(), vulns: d.vulnerabilities || [] };
    }
    const needle = q.toLowerCase();
    return _kevCache.vulns
      .filter((v) => `${v.cveID} ${v.vendorProject} ${v.product} ${v.vulnerabilityName}`.toLowerCase().includes(needle))
      .slice(0, 3)
      .map((v) => src(`https://www.cisa.gov/known-exploited-vulnerabilities-catalog`, `${v.cveID}: ${v.vulnerabilityName}`, `${v.vendorProject} ${v.product}${v.knownRansomwareCampaignUse === "Known" ? " · 勒索软件在用" : ""} · due ${v.dueDate}`, v.dateAdded));
  },
};

// ---------------- P3-4 金融 ----------------

const yahoofinance = {
  desc: "Stock quote by ticker symbol (e.g. 'NVDA', '0700.HK', '600519.SS')",
  async run(q) {
    const sym = q.trim().split(/\s+/).pop().toUpperCase();
    const d = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`);
    const m = d.chart?.result?.[0]?.meta;
    if (!m) throw new Error(`unknown ticker ${sym}`);
    const px = m.regularMarketPrice, prev = m.chartPreviousClose;
    const chg = prev ? ((px - prev) / prev * 100).toFixed(2) : "?";
    return [src(`https://finance.yahoo.com/quote/${sym}`, `${sym}: ${px} ${m.currency} (${chg >= 0 ? "+" : ""}${chg}%)`, `${m.fullExchangeName || m.exchangeName || ""} · prev close ${prev ?? "?"}`, "")];
  },
};

const coingecko = {
  desc: "Crypto coin search + USD price (e.g. 'bitcoin', 'eth')",
  async run(q) {
    const s = await getJson(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`);
    const coins = (s.coins || []).slice(0, 3);
    if (!coins.length) return [];
    const p = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${coins.map((c) => c.id).join(",")}&vs_currencies=usd`);
    return coins.map((c) => src(`https://www.coingecko.com/en/coins/${c.id}`, `${c.name} (${String(c.symbol).toUpperCase()})`, `rank ${c.market_cap_rank ?? "?"} · $${p[c.id]?.usd ?? "?"}`, ""));
  },
};

const frankfurter = {
  desc: "ECB FX rate between two currencies (e.g. 'USD CNY', 'EUR to JPY')",
  async run(q) {
    const codes = (q.toUpperCase().match(/\b[A-Z]{3}\b/g) || []).filter((c) => c !== "THE");
    if (codes.length < 2) throw new Error("give two ISO codes, e.g. 'USD CNY'");
    const d = await getJson(`https://api.frankfurter.dev/v1/latest?from=${codes[0]}&to=${codes[1]}`);
    const rate = d.rates?.[codes[1]];
    if (rate == null) throw new Error(`no rate for ${codes[0]}/${codes[1]} (ECB reference set)`);
    return [src("https://frankfurter.app", `1 ${codes[0]} = ${rate} ${codes[1]}`, `ECB reference rate ${d.date}`, d.date)];
  },
};

// SEC EDGAR：UA 不能带 URL（否则 403），forms/entityName 从查询里拆（对标 sec_edgar.py 的实测结论）
const SEC_FORM_RE = /\b(10-K(?:\/A)?|10-Q(?:\/A)?|8-K(?:\/A)?|20-F|S-1|S-4|13F(?:-HR)?|DEF\s?14A)\b/i;
const SEC_NOT_TICKERS = new Set(["A", "I", "AND", "OR", "THE", "IN", "OF", "TO", "AI", "ML", "US", "USA", "UK", "EU", "CEO", "CFO", "IPO", "ESG", "GDP", "SEC", "EPS", "ETF", "PDF", "API", "INC", "LTD", "IT", "ALL", "NEW", "ON", "SO", "GO", "NOW", "BY", "FOR"]);
const secEdgar = {
  desc: "SEC EDGAR full-text filing search (e.g. 'NVDA 10-K risk factors', 'Tesla 8-K')",
  async run(q) {
    const formM = q.match(SEC_FORM_RE);
    const form = formM ? formM[1].toUpperCase().replace(/\s/g, "") : "";
    let text = form ? q.replace(SEC_FORM_RE, " ").trim() : q;
    const ticker = text.split(/\s+/).find((t) => /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(t) && !SEC_NOT_TICKERS.has(t));
    const params = new URLSearchParams({ q: text || q, ...(form ? { forms: form } : {}), ...(ticker ? { entityName: ticker } : {}) });
    const r = await httpsJson("GET", `https://efts.sec.gov/LATEST/search-index?${params}`, { headers: { "User-Agent": "dsh-free-search plugin", Accept: "application/json" }, timeoutMs: 25000 });
    if (r.status !== 200) throw new Error(`EDGAR HTTP ${r.status}`);
    const hits = (JSON.parse(r.text).hits?.hits || []).slice(0, 3);
    return hits.map((h) => {
      const s = h._source || {};
      const [accession, doc] = String(h._id || ":").split(":");
      const cik = String(s.cik || "").replace(/^0+/, "");
      const url = cik && accession && doc ? `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, "")}/${doc}` : "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany";
      return src(url, `${(s.display_names || [])[0] || "SEC filing"} ${s.file_type || form || ""}`, `filed ${s.file_date || "?"}${s.file_description ? " · " + s.file_description : ""}`, day(s.file_date));
    });
  },
};

// IMF DataMapper：无文本搜索，目录(132 指标/229 国)进程内缓存，词元重合度匹配
// ponytail: 词元重合替代 rapidfuzz；命中率不足时再引入模糊匹配
let _imfCat = null;
const imf = {
  desc: "IMF macro series by country+indicator (e.g. 'china gdp growth', '美国 通胀')",
  async run(q) {
    if (!_imfCat) {
      const [ind, ctry] = await Promise.all([
        getJson("https://www.imf.org/external/datamapper/api/v1/indicators"),
        getJson("https://www.imf.org/external/datamapper/api/v1/countries"),
      ]);
      _imfCat = { ind: ind.indicators || {}, ctry: ctry.countries || {} };
    }
    const lower = q.toLowerCase();
    const countries = Object.entries(_imfCat.ctry).filter(([, v]) => lower.includes(v.label?.toLowerCase() || "\u0000")).map(([k, v]) => ({ code: k, label: v.label }));
    const qWords = lower.split(/\s+/).filter((w) => w.length > 2 && !countries.some((c) => c.label.toLowerCase().includes(w)));
    const scored = Object.entries(_imfCat.ind)
      .map(([code, meta]) => ({ code, label: meta.label || "", score: qWords.filter((w) => (meta.label || "").toLowerCase().includes(w)).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    if (!scored.length) throw new Error("no IMF indicator matches; try 'gdp growth', 'inflation', 'unemployment'…");
    const out = [];
    for (const ind of scored) {
      const series = await getJson(`https://www.imf.org/external/datamapper/api/v1/${ind.code}`);
      const values = series[ind.code]?.countries || {};
      const targets = countries.length ? countries.map((c) => c.code) : ["USA", "CHN", "WLD"];
      for (const cc of targets.slice(0, 2)) {
        const years = values[cc];
        if (!years) continue;
        const recent = Object.entries(years).filter(([y]) => Number(y) >= new Date().getFullYear() - 8);
        const tail = recent.map(([y, v]) => `${y}:${v}`).join(" ");
        out.push(src(`https://www.imf.org/external/datamapper/${ind.code}/@country/${cc}`, `${_imfCat.ctry[cc]?.label || cc} · ${ind.label}`, tail, ""));
      }
    }
    return out;
  },
};

const cfets = {
  desc: "人民币中间价（USD 或任意币种对 CNY，PBOC 每交易日 9:15 公布；e.g. 'USD'/'美元'/'日元'）",
  async run(q) {
    const d = await getJson("https://www.chinamoney.com.cn/r/cms/www/chinamoney/data/fx/ccpr.json");
    const zhMap = { 美元: "USD", 欧元: "EUR", 日元: "JPY", 英镑: "GBP", 港币: "HKD", 澳元: "AUD", 加元: "CAD", 新加坡元: "SGD", 韩元: "KRW" };
    const upper = q.toUpperCase();
    const wanted = (upper.match(/[A-Z]{3}/) || [])[0] || zhMap[q.trim()] || "USD";
    const stamp = d.data?.lastDate || "";
    const row = (d.records || []).find((r) => (r.vrtEName || "").replace("100", "").startsWith(wanted));
    if (!row) return [];
    const per = (row.vrtEName || "").startsWith("100") ? 100 : 1;
    const rate = parseFloat(String(row.price).replace(/,/g, "")) / per;
    return [src("https://www.chinamoney.com.cn/chinese/bkccpr/", `${wanted}/CNY 中间价 ${rate.toPrecision(6)}（${String(stamp).slice(0, 10)}）`, `1 ${wanted} = ${rate} CNY · 中国外汇交易中心每交易日 9:15 公布，非实时汇率${per === 100 ? " · 每 100 外币计价折算" : ""}`, String(stamp).slice(0, 10))];
  },
};

const cninfo = {
  desc: "巨潮资讯：A 股/科创板/港股公告原文检索（e.g. '宁德时代 年报', '人工智能 业绩预告'）",
  async run(q) {
    const form = new URLSearchParams({ pageNum: "1", pageSize: "5", column: "szse", tabName: "fulltext", searchkey: q, isHLtitle: "true" });
    const r = await httpsJson("POST", "https://www.cninfo.com.cn/new/hisAnnouncement/query", {
      headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(), timeoutMs: 25000,
    });
    if (r.status !== 200) throw new Error(`cninfo HTTP ${r.status}`);
    const items = JSON.parse(r.text).announcements || [];
    return items.slice(0, 5).map((a) => {
      const date = Number.isFinite(a.announcementTime) ? new Date(a.announcementTime / 1000 + 8 * 3600 * 1000).toISOString().slice(0, 10) : "";
      return src(`https://static.cninfo.com.cn/${String(a.adjunctUrl || "").replace(/^\//, "")}`, `${a.secName || ""}(${a.secCode || ""}) ${String(a.announcementTitle || "").replace(/<[^>]+>/g, "")}`, `披露 ${date}${a.adjunctType ? " · " + a.adjunctType : ""}`, date);
    });
  },
};

// ---------------- P3-5 数据 / 事实 ----------------
// ponytail: wdi 并入 worldbank（同一 API 同一数据库）；facts 非引擎（参考实现的辅助模块），均不单列

const WB_IND = { gdp: "NY.GDP.MKTP.CD", "gdp growth": "NY.GDP.MKTP.KD.ZG", 增速: "NY.GDP.MKTP.KD.ZG", population: "SP.POP.TOTL", 人口: "SP.POP.TOTL", inflation: "FP.CPI.TOTL.ZG", 通胀: "FP.CPI.TOTL.ZG", unemployment: "SL.UEM.TOTL.ZS", 失业: "SL.UEM.TOTL.ZS", co2: "EN.GHG.CO2.MT.CE.AR5", 碳排放: "EN.GHG.CO2.MT.CE.AR5", energy: "EG.USE.PCAP.KG.OE", trade: "NE.TRD.GNFS.ZS" };
const WB_CTRY = { 中国: "CHN", 美国: "USA", 日本: "JPN", 印度: "IND", 德国: "DEU", 英国: "GBR", 法国: "FRA", 韩国: "KOR", 世界: "WLD", 巴西: "BRA", 俄罗斯: "RUS", china: "CHN", "united states": "USA", usa: "USA", japan: "JPN", india: "IND", germany: "DEU", uk: "GBR", britain: "GBR", france: "FRA", korea: "KOR", world: "WLD", brazil: "BRA", russia: "RUS" };
const WB_NOT_ISO = new Set(["GDP", "CO2", "EPS", "ESG", "IMF", "USA", "WLD"]);
const worldbank = {
  desc: "World Bank indicator by country (e.g. 'china gdp', '美国 人口', 'CN inflation')",
  async run(q) {
    const lower = q.toLowerCase();
    const indKey = Object.keys(WB_IND).find((k) => k.includes(" ") ? lower.includes(k) : new RegExp(`\\b${k}\\b`, "i").test(lower) || q.includes(k));
    const zhOrEn = Object.entries(WB_CTRY).find(([name]) => lower.includes(name.toLowerCase()));
    const iso = (q.toUpperCase().match(/\b[A-Z]{3}\b/g) || []).filter((t) => !WB_NOT_ISO.has(t) || WB_CTRY[t.toLowerCase()])[0];
    const ctry = zhOrEn?.[1] || iso;
    if (!indKey) throw new Error(`indicator? try: ${Object.keys(WB_IND).slice(0, 6).join("/")}`);
    if (!ctry) throw new Error("country? e.g. 'china', '美国', or ISO code CHN");
    const d = await getJson(`https://api.worldbank.org/v2/country/${ctry}/indicator/${WB_IND[indKey]}?format=json&per_page=1&mrnev=1`);
    const row = (d[1] || [])[0];
    if (!row) return [];
    return [src(`https://data.worldbank.org/indicator/${WB_IND[indKey]}?locations=${ctry}`, `${row.country?.value || ctry} · ${row.indicator?.value || indKey}: ${row.value} (${row.date})`, `World Bank WDI, most recent non-empty value`, row.date)];
  },
};

const wikidata = {
  desc: "Wikidata entity lookup (Q-id, label, description)",
  async run(q) {
    const d = await getJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=zh-cn&format=json&limit=3`);
    return (d.search || []).map((s) => src(s.concepturi, `${s.label} (${s.id})`, s.description || "", ""));
  },
};

const HOL_CTRY = { 中国: "CN", 美国: "US", 日本: "JP", 德国: "DE", 英国: "GB", 法国: "FR", 韩国: "KR", 香港: "HK", 台湾: "TW", 新加坡: "SG", 澳大利亚: "AU", 加拿大: "CA", 印度: "IN", 俄罗斯: "RU" };
const holidays = {
  desc: "Public holidays by country+year (nager.date; e.g. '中国 2026', 'US 2025')",
  async run(q) {
    const year = (q.match(/\b(20\d{2})\b/) || [])[1] || String(new Date().getFullYear());
    const cc = (q.toUpperCase().match(/\b[A-Z]{2}\b/) || [])[1] || Object.entries(HOL_CTRY).find(([zh]) => q.includes(zh))?.[1];
    if (!cc) throw new Error(`country? e.g. '中国', 'US', ${Object.keys(HOL_CTRY).slice(0, 4).join("/")}`);
    const d = await getJson(`https://date.nager.at/api/v3/publicholidays/${year}/${cc}`);
    return d.slice(0, 3).map((h) => src(`https://date.nager.at`, `${h.localName || h.name} (${h.name})`, `${h.date}${h.types?.length ? " · " + h.types.join("/") : ""} · ${cc} ${year}`, h.date));
  },
};

const TZ_MAP = { 北京: "Asia/Shanghai", 上海: "Asia/Shanghai", 东京: "Asia/Tokyo", 首尔: "Asia/Seoul", 纽约: "America/New_York", 洛杉矶: "America/Los_Angeles", 伦敦: "Europe/London", 巴黎: "Europe/Paris", 柏林: "Europe/Berlin", 莫斯科: "Europe/Moscow", 迪拜: "Asia/Dubai", 悉尼: "Australia/Sydney", 新加坡: "Asia/Singapore" };
const worldclock = {
  desc: "Current time in a city/timezone — computed locally, zero network (e.g. '东京', 'America/New_York')",
  async run(q) {
    const key = q.trim();
    const tz = TZ_MAP[key] || (/^[A-Za-z_]+\/[A-Za-z_]+$/.test(key) ? key : null);
    if (!tz) throw new Error(`city? e.g. ${Object.keys(TZ_MAP).slice(0, 5).join("/")} or IANA zone like America/New_York`);
    const now = new Intl.DateTimeFormat("zh-CN", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());
    return [src(`https://time.is/${encodeURIComponent(key)}`, `${key} 当前时间`, `${now} (${tz})`, "")];
  },
};

const openmeteo = {
  desc: "Current weather by city name (open-meteo, keyless; e.g. '北京', 'Tokyo')",
  async run(q) {
    const g = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=1&language=zh`);
    const loc = (g.results || [])[0];
    if (!loc) throw new Error(`no location "${q}"`);
    const w = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current_weather=true`);
    const c = w.current_weather || {};
    return [src(`https://open-meteo.com/`, `${loc.name}${loc.country ? ", " + loc.country : ""} 天气`, `当前 ${c.temperature}°C · 风速 ${c.windspeed} km/h · 天气代码 ${c.weathercode}`, "")];
  },
};

const rdap = {
  desc: "Domain registration/expiry via RDAP (e.g. 'example.com')",
  async run(q) {
    const domain = q.trim().toLowerCase().match(/([a-z0-9-]+\.[a-z.]{2,})/)?.[1];
    if (!domain) throw new Error("give a domain, e.g. 'example.com'");
    let url = `https://rdap.org/domain/${domain}`;
    for (let i = 0; i < 3; i++) {
      const r = await httpsJson("GET", url, { headers: UA, timeoutMs: 20000 });
      if (r.status === 200) {
        const d = JSON.parse(r.text);
        const ev = (action) => d.events?.find((e) => e.eventAction === action)?.eventDate || "";
        const registrar = (d.entities || []).find((e) => (e.roles || []).includes("registrar"))?.vcardArray?.[1]?.find?.((x) => x[0] === "fn")?.[3];
        return [src(`https://rdap.org/?query=${domain}`, `${domain}: registered ${ev("registration") ? ev("registration").slice(0, 10) : "?"}, expires ${ev("expiration") ? ev("expiration").slice(0, 10) : "?"}`, `${registrar ? "registrar: " + registrar + " · " : ""}status ${(d.status || []).slice(0, 3).join(" ")}`, ev("expiration").slice(0, 10))];
      }
      if ([301, 302, 303, 307].includes(r.status) && r.location) { url = r.location; continue; }
      throw new Error(`RDAP HTTP ${r.status}`);
    }
    throw new Error("RDAP: too many redirects");
  },
};

const gleif = {
  desc: "GLEIF LEI record by legal name or LEI code (e.g. 'Apple', '529900T8BM49AURSDO55')",
  async run(q) {
    const s = q.trim();
    const url = /^[A-Z0-9]{20}$/.test(s)
      ? `https://api.gleif.org/api/v1/lei-records/${s}`
      : `https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=${encodeURIComponent(s)}&page[size]=3`;
    const d = await getJson(url);
    const items = d.data ? (Array.isArray(d.data) ? d.data : [d.data]) : [];
    return items.slice(0, 3).map((x) => { const a = x.attributes || {}; return src(`https://search.gleif.org/#/search/simpleSearch=${a.lei}`, `${a.entity?.legalName?.name || s} (${a.lei})`, `LEI status: ${a.entity?.status || a.registration?.status || "?"}`, ""); });
  },
};

// ---------------- P3-6 新闻 ----------------

const googlenews = {
  desc: "Google News RSS by keyword (Chinese edition; e.g. 'DeepSeek 发布会')",
  async run(q) {
    const r = await httpsJson("GET", `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`, { headers: UA, timeoutMs: 25000 });
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    const items = [...r.text.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 3).map(([m]) => {
      const pick = (t) => { const x = m.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)); return x ? htmlToText(x[1].replace(/<!\[CDATA\[|\]\]>/g, "")) : ""; };
      const pub = pick("pubDate");
      return src(pick("link"), pick("title"), pick("description").slice(0, 220), pub ? new Date(pub).toISOString().slice(0, 10) : "");
    });
    return items;
  },
};

const gdelt = {
  desc: "GDELT world news articles by keyword (global coverage, ~15min delay)",
  async run(q) {
    const d = await getJson(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=3&format=json&sort=hybridrel`);
    return (d.articles || []).map((a) => { const s = a.seendate || ""; return src(a.url, a.title || a.url, `${a.domain || ""} · ${a.sourcecountry || ""}`, s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : ""); });
  },
};

// AIHOT 公开 REST（openapi-v1.json 实测）：/api/v1/items 关键词检索（参数名 q，2-200 字符），
// window 只覆盖最近 7 天（默认即 7d），限流 ~60 次/分钟。
// 证据契约（方案 v4.3 §2.6）：summary 是 AIHOT 的 LLM 生成摘要 → snippet 标 text_origin=provider-summary，
// 不当正文；url 用 links.original（原文链），publishedAt 用 publishedAt（与 discoveredAt 采集时间分开）。
const aihot = {
  desc: "AIHOT: AI 领域资讯/热点关键词检索（编辑精选，仅覆盖最近 7 天窗口；摘要为 AIHOT LLM 生成即 provider-summary，非原文正文）",
  async run(q) {
    const kw = String(q || "").trim();
    if (kw.length < 2) throw new Error("keyword too short (2-200 chars)");
    const d = await getJson(
      `https://aihot.news/api/v1/items?mode=selected&window=7d&q=${encodeURIComponent(kw)}&limit=5`,
      { "User-Agent": "aihot-api/2.0.0 dsh-free-search", Accept: "application/json" },
    );
    return (d.items || []).map((it) => {
      const url = it.links?.original || it.links?.aihot || "";
      const snippet = it.summary ? `[provider-summary] ${String(it.summary)}` : "";
      return src(url, it.title || it.originalTitle || url, snippet, day(it.publishedAt));
    }).filter((s) => s.url);
  },
};

// ---------------- P3-7 中文站 ----------------
// zhihu 不接：免 key 路径被登录墙+x-zse-96 签名判死（参考实现自述需 Playwright 且不可靠），需要时用 firecrawl
// ponytail: HTML 正则抓取，页面改版即失效（返回 []），与参考实现同款取舍

const BROWSER_UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36", Accept: "text/html,*/*", "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8" };
const strip = (s) => htmlToText(String(s || ""));

const so360 = {
  desc: "360 搜索：中文网页（HTML 抓取，直链 URL）",
  async run(q) {
    const r = await httpsJson("GET", `https://www.so.com/s?q=${encodeURIComponent(q)}&rn=10`, { headers: BROWSER_UA, timeoutMs: 25000 });
    if (r.status !== 200) return [];
    const blocks = r.text.match(/<li class="res-list"[\s\S]*?<\/li>/g) || [];
    return blocks.slice(0, 5).map((b) => {
      const a = b.match(/<h3[^>]*>\s*<a[^>]*>/)?.[0] || "";
      const href = (a.match(/href="([^"]+)"/) || [])[1] || "";
      const mdurl = (a.match(/data-mdurl="([^"]+)"/) || [])[1];
      const title = strip(b.match(/<h3[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/)?.[1]);
      const snippet = strip(b.match(/<(?:p class="res-desc"|div class="res-comm-con)[^>]*>([\s\S]*?)<\/(?:p|div)>/)?.[1]);
      const url = (mdurl || href || "").replace(/&amp;/g, "&");
      return url.startsWith("http") && title ? src(url, title, snippet, "") : null;
    }).filter(Boolean);
  },
};

const sogou = {
  desc: "搜狗搜索：中文网页（HTML 抓取；结果为搜狗重定向链接，抓取时会自动跟随）",
  async run(q) {
    const r = await httpsJson("GET", `https://www.sogou.com/web?query=${encodeURIComponent(q)}`, { headers: BROWSER_UA, timeoutMs: 25000 });
    if (r.status !== 200) return [];
    const blocks = r.text.match(/<h3 class="vr-title[^"]*">[\s\S]*?<\/h3>/g) || [];
    return blocks.slice(0, 5).map((b) => {
      const href = (b.match(/href="([^"]+)"/) || [])[1] || "";
      const title = strip(b.match(/<a[^>]*>([\s\S]*?)<\/a>/)?.[1]);
      if (!title || !href || href.startsWith("javascript:")) return null;
      const url = href.startsWith("http") ? href : `https://www.sogou.com${href}`;
      const snippet = strip(b.replace(/<[^>]+>/g, " ")).slice(0, 200);
      return src(url, title, snippet, "");
    }).filter(Boolean);
  },
};

// ---------------- P3-8 法律 ----------------
// 四个免 key 法律源（2026-10 实测）：Federal Register / CourtListener / openlegaldata / legislation.gov.uk。
// 中国与香港的官方库（flk.npc.gov.cn、elegislation.gov.hk）是 SPA + 反爬，没有可直连的 JSON API，故不接。

const federalregister = {
  desc: "US Federal Register: US federal rules, proposed rules and notices by keyword (keyless JSON)",
  async run(q) {
    const d = await getJson(
      `https://www.federalregister.gov/api/v1/documents.json?per_page=3&order=relevance&conditions[term]=${encodeURIComponent(q)}` +
        `&fields[]=title&fields[]=html_url&fields[]=publication_date&fields[]=type`,
    );
    return (d.results || []).map((x) => src(x.html_url, x.title, x.type || "", day(x.publication_date)));
  },
};

const courtlistener = {
  desc: "US CourtListener: US case-law opinions by keyword (keyless search API)",
  async run(q) {
    const d = await getJson(`https://www.courtlistener.com/api/rest/v4/search/?q=${encodeURIComponent(q)}&type=o&page_size=3`);
    return (d.results || [])
      .map((r) => src(
        r.absolute_url ? `https://www.courtlistener.com${r.absolute_url}` : "",
        r.caseName || "",
        [r.court, r.docketNumber ? `No. ${r.docketNumber}` : "", r.citation?.[0] || ""].filter(Boolean).join(" · "),
        day(r.dateFiled),
      ))
      .filter((s) => s.url);
  },
};

const openlegaldata = {
  desc: "openlegaldata.io: German court decisions by keyword (keyless JSON; query goes in ?text=)",
  async run(q) {
    const d = await getJson(`https://de.openlegaldata.io/api/cases/search/?text=${encodeURIComponent(q)}&format=json&limit=3`);
    return (d.results || []).map((r) => src(
      `https://de.openlegaldata.io/case/${r.slug || r.id}/`,
      `${r.court || "?"} · ${r.decision_type || r.slug || ""}`.trim(),
      htmlToText(String(r.snippets?.[0]?.text || "")).slice(0, 220),
      day(r.date),
    ));
  },
};

const uklegislation = {
  desc: "UK legislation.gov.uk: UK Acts and statutory instruments by title keyword (keyless Atom feed)",
  async run(q) {
    const r = await httpsJson("GET", `https://www.legislation.gov.uk/all/data.feed?title=${encodeURIComponent(q)}`, { headers: { ...UA, Accept: "application/atom+xml, application/xml, text/xml, */*" }, timeoutMs: 25000 });
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    return [...r.text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 3).map(([e]) => {
      const pick = (t) => { const x = e.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return x ? htmlToText(x[1]) : ""; };
      const links = [...e.matchAll(/<link\b[^>]*href="([^"]+)"/g)].map((m) => m[1]);
      const link = (links.find((u) => !u.includes("/id/")) || links[0] || "").replace(/^http:/, "https:");
      const updated = pick("updated");
      return src(link, pick("title"), "", updated ? updated.slice(0, 10) : "");
    }).filter((s) => s.url && s.title);
  },
};

// ---------------- 工具注册 ----------------

export const ENGINES = {
  // 通用/包/版本
  pypi, crates, github_releases: githubReleases, endoflife, registries, huggingface,
  // 学术
  crossref, openalex, s2, arxiv, pubmed, europepmc, dblp, zenodo, doaj,
  // 安全
  nvd, osv, cisakev,
  // 金融
  yahoofinance, coingecko, frankfurter, sec_edgar: secEdgar, imf, cfets, cninfo,
  // 数据/事实
  worldbank, wikidata, holidays, worldclock, openmeteo, rdap, gleif,
  // 新闻
  googlenews, gdelt, aihot,
  // 法律
  federalregister, courtlistener, openlegaldata, uk_legislation: uklegislation,
  // 中文站
  so360, sogou,
};

export function registerDomainSearchTool(ctx, { wrapUntrustedBlock, getConfig = () => ({}), ns, isToolDisabled = () => false } = {}) {
  ctx.inject(["tools"], (sctx) => {
    localizedEffect(sctx, {
      label: "free-search: domain search tool",
      ns,
      getLang: () => promptLanguageOf(getConfig()),
      getEnabled: () => !isToolDisabled("domain_search"),
      register: (lang) => {
      const dispose = sctx.tools.register(
        defineTool({
          name: "domain_search",
          description: toolDescription(lang, "domain_search"),
          parameters: {
            engine: { type: "string", description: toolParam(lang, "domain_search", "engine", { ids: Object.keys(ENGINES).join(", ") }) },
            query: { type: "string", description: toolParam(lang, "domain_search", "query") },
          },
          output: {
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                engine: { type: "string" },
                query: { type: "string" },
                sources: { type: "array", items: { type: "object", additionalProperties: false, properties: { url: { type: "string" }, title: { type: "string" }, snippet: { type: "string" }, publishedAt: { type: "string" } } } },
                error: { type: "string" },
              },
            },
            render(_args, value) {
              if (value.error) {
                const message = stripLoneSurrogates(String(value.error));
                return [{ type: "text", text: `domain_search (${value.engine}) failed: ${message}` }];
              }
              const lines = value.sources.map((s, i) => `- [${i + 1}] ${s.title} — ${s.url}${s.publishedAt ? ` _(${s.publishedAt})_` : ""}${s.snippet ? `\n      ${s.snippet}` : ""}`);
              return [{ type: "text", text: wrapUntrustedBlock(`domain_search ${value.engine} — ${value.query}:\n${lines.join("\n") || "No results."}`) }];
            },
          },
          async execute(args) {
            const engine = ENGINES[args.engine];
            if (!engine) return { engine: args.engine, query: args.query, sources: [], error: `unknown engine; valid: ${Object.keys(ENGINES).join(", ")}` };
            try {
              const sources = await engine.run(args.query);
              return { engine: args.engine, query: args.query, sources };
            } catch (e) {
              return { engine: args.engine, query: args.query, sources: [], error: e.message };
            }
          },
        })
      );
      return () => dispose();
    } });
  });
}
