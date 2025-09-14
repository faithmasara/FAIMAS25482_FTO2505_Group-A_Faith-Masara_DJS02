// Tailwind build using native web component + your data.js
import { podcasts as RAW_PODCASTS, genres as RAW_GENRES, seasons as RAW_SEASONS } from "./data.js";

/* ================= Utils ================= */
const timeAgo = (dateLike) => {
  const d = new Date(dateLike);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const steps = [
    { a: 60, u: "second" }, { a: 60, u: "minute" }, { a: 24, u: "hour" },
    { a: 7, u: "day" }, { a: 4.34524, u: "week" }, { a: 12, u: "month" }, { a: Infinity, u: "year" },
  ];
  let n = s; for (const k of steps) { if (Math.abs(n) < k.a) return rtf.format(Math.round(-n), k.u); n /= k.a; }
  return "";
};
const fmtDate = (d) =>
  new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

/* ================= Data mapping / repo ================= */
const GENRE_NAME_BY_ID = new Map(RAW_GENRES.map((g) => [g.id, g.title]));
const SEASONS_BY_ID = new Map(RAW_SEASONS.map((s) => [String(s.id), s.seasonDetails || []]));

// Normalize to display shape
const PODCASTS = RAW_PODCASTS.map((p, i) => ({
  id: String(p.id),
  title: p.title,
  description: p.description || "",
  genres: (p.genres || []).map((gid) => GENRE_NAME_BY_ID.get(gid)).filter(Boolean),
  seasonsCount: Number(p.seasons ?? (SEASONS_BY_ID.get(String(p.id)) || []).length) || 0,
  updatedAt: p.updated,
  popularity: RAW_PODCASTS.length - i, // simple stable fallback
}));

class PodcastRepository {
  constructor(items){ this.items = items; }
  allGenres(){ return ["All Genres", ...new Set(this.items.flatMap(p => p.genres))]; }
  query({genre="All Genres", sort="recent"}={}){
    let out=[...this.items];
    if(genre!=="All Genres") out = out.filter(p => p.genres.includes(genre));
    if(sort==="popular") out.sort((a,b)=>b.popularity-a.popularity);
    else out.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));  // recent/newest share key
    return out;
  }
  byId(id){ return this.items.find(p=>p.id===String(id)); }
  seasonDetails(id){ return SEASONS_BY_ID.get(String(id)) || []; }
}
const repo = new PodcastRepository(PODCASTS);

/* ================= Web Component =================
   <podcast-preview> – Shadow DOM (encapsulated)
   Stateless; accepts data via attributes or `.data`
   Emits 'podcast-select' when clicked/activated
=================================================== */
const tpl = document.createElement("template");
tpl.innerHTML = /* html */ `
  <style>
    :host { display:block; color:#111827; }
    .card{
      background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:16px;
      box-shadow:0 1px 1px rgb(0 0 0 / .05), 0 6px 16px rgb(0 0 0 / .06);
      transition: box-shadow .18s ease, transform .06s ease;
      cursor:pointer; outline:none;
    }
    .card:hover{ box-shadow:0 2px 10px rgba(0,0,0,.08), 0 10px 24px rgba(0,0,0,.08); }
    .card:active{ transform: translateY(1px); }
    .card:focus-visible{ outline:2px solid #2563eb; outline-offset:2px; }

    .ph{
      width:100%; aspect-ratio: 4 / 3; border-radius:10px; background:#9aa3af; color:#fff;
      display:grid; place-items:center; user-select:none; font-size:14px; letter-spacing:.2px;
    }
    h3{ margin:14px 0 2px; font-size:16px; font-weight:600; line-height:1.25; }
    .meta{ margin-top:2px; font-size:13px; color:#374151; display:flex; align-items:center; gap:6px; }
    .tags{ margin-top:8px; display:flex; flex-wrap:wrap; gap:8px; }
    .pill{ border:1px solid #e5e7eb; background:#f3f4f6; border-radius:9999px; padding:6px 10px; font-size:12px; color:#111827; line-height:1; }
    .updated{ margin-top:10px; font-size:13px; color:#6b7280; }
  </style>
  <article class="card" role="button" tabindex="0" aria-label="Open podcast">
    <div class="ph">Podcast Cover</div>
    <h3></h3>
    <div class="meta"><span>📅</span><span class="seasons"></span></div>
    <div class="tags"></div>
    <div class="updated"></div>
  </article>
`;

class PodcastPreview extends HTMLElement {
  static get observedAttributes(){ return ["podcast-id","title","genres","seasons","updated"]; }
  constructor(){
    super();
    this.attachShadow({mode:"open"}).appendChild(tpl.content.cloneNode(true));
    const $ = (s)=>this.shadowRoot.querySelector(s);
    this.$root = $(".card");
    this.$title = this.shadowRoot.querySelector("h3");
    this.$seasons = $(".seasons");
    this.$tags = $(".tags");
    this.$updated = $(".updated");

    this.$root.addEventListener("click", ()=>this._emit());
    this.$root.addEventListener("keydown", (e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); this._emit(); }});
  }
  set data(o){
    if(!o) return;
    if(o.id!=null) this.setAttribute("podcast-id", String(o.id));
    if(o.title!=null) this.setAttribute("title", String(o.title));
    if(o.seasons!=null) this.setAttribute("seasons", String(o.seasons));
    if(o.updated!=null) this.setAttribute("updated", String(o.updated));
    if(o.genres!=null){
      const g = Array.isArray(o.genres) ? o.genres : String(o.genres).split(",");
      this.setAttribute("genres", g.map(s=>s.trim()).filter(Boolean).join(","));
    }
  }
  get data(){
    return {
      id: this.getAttribute("podcast-id") ?? null,
      title: this.getAttribute("title") ?? "",
      genres: (this.getAttribute("genres")||"").split(",").map(s=>s.trim()).filter(Boolean),
      seasons: Number(this.getAttribute("seasons")||0),
      updated: this.getAttribute("updated") || ""
    };
  }
  connectedCallback(){ this._render(); }
  attributeChangedCallback(){ this._render(); }

  _render(){
    const {title,genres,seasons,updated} = this.data;
    this.$title.textContent = title || "Podcast Title";
    this.$seasons.textContent = `${seasons} season${seasons===1?"":"s"}`;
    this.$tags.replaceChildren(...genres.map(g=>{ const s=document.createElement("span"); s.className="pill"; s.textContent=g; return s; }));
    if(updated){ this.$updated.textContent = `Updated ${timeAgo(updated)}`; this.$updated.title = fmtDate(updated); }
  }
  _emit(){ this.dispatchEvent(new CustomEvent("podcast-select", { detail:this.data, bubbles:true, composed:true })); }
}
customElements.define("podcast-preview", PodcastPreview);

/* ================= App wiring ================= */
const els = {
  grid: document.getElementById("grid"),
  genre: document.getElementById("genreSelect"),
  sort: document.getElementById("sortSelect"),
  modal: document.getElementById("modal"),
  backdrop: document.getElementById("backdrop"),
  mTitle: document.getElementById("modalTitle"),
  mDesc: document.getElementById("modalDesc"),
  mCover: document.getElementById("modalCover"),
  mCoverPh: document.getElementById("modalCoverPh"),
  mGenres: document.getElementById("modalGenres"),
  mUpdated: document.getElementById("modalUpdated"),
  mSeasons: document.getElementById("modalSeasons"),
  close: document.getElementById("close"),
  closeTop: document.getElementById("closeTop"),
};

/* Controls */
els.genre.replaceChildren(...repo.allGenres().map((g)=>new Option(g,g)));
els.genre.value = "All Genres";
els.genre.addEventListener("change", render);
els.sort.addEventListener("change", render);

/* Modal open/close */
const openModal = () => {
  els.modal.classList.remove("hidden");
  els.modal.firstElementChild.classList.remove("translate-y-1","opacity-0");
  els.backdrop.classList.remove("hidden");
};
const closeModal = () => {
  els.modal.classList.add("hidden");
  els.modal.firstElementChild.classList.add("translate-y-1","opacity-0");
  els.backdrop.classList.add("hidden");
};
els.close.addEventListener("click", closeModal);
els.closeTop.addEventListener("click", closeModal);
els.backdrop.addEventListener("click", closeModal);
document.addEventListener("keydown", (e)=>{ if(e.key==="Escape") closeModal(); });

/* Render grid using the component */
function render(){
  const items = repo.query({ genre: els.genre.value, sort: els.sort.value });
  const nodes = items.map((p)=>{
    const el = document.createElement("podcast-preview");
    el.data = { id:p.id, title:p.title, genres:p.genres, seasons:p.seasonsCount, updated:p.updatedAt };

    el.addEventListener("podcast-select", (ev)=>{
      const pod = repo.byId(ev.detail.id); if(!pod) return;

      els.mTitle.textContent = pod.title;
      els.mDesc.textContent = pod.description;
      els.mGenres.replaceChildren(...pod.genres.map(g=>{
        const s=document.createElement("span");
        s.className="border border-gray-200 bg-gray-100 rounded-full px-2.5 py-1 text-xs";
        s.textContent=g; return s;
      }));
      els.mUpdated.textContent = `Last updated: ${fmtDate(pod.updatedAt)}`;

      // Keep the big gray placeholder look (wireframe)
      els.mCover.hidden = true;
      els.mCoverPh.classList.remove("hidden");

      // season list
      els.mSeasons.replaceChildren(
        ...repo.seasonDetails(pod.id).map((s)=>{
          const row=document.createElement("div");
          row.className="flex items-center justify-between border border-gray-200 rounded-md px-3 py-2";
          const left=document.createElement("div"); left.className="font-semibold"; left.textContent=s.title;
          const right=document.createElement("div"); right.className="text-sm text-gray-600"; right.textContent=`${s.episodes} episodes`;
          row.append(left,right); return row;
        })
      );

      openModal();
      els.closeTop.focus();
    });

    return el;
  });

  els.grid.replaceChildren(...nodes);
}

/* First paint */
render();
