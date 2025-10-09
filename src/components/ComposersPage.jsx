import React, { useState, useEffect, useMemo, useRef } from 'react';
import SiteNavbar from './SiteNavbar.jsx';

function normalizeStr(s) {
  if (s === null || s === undefined) return '';
  try {
    return String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  } catch (err) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
}
function cleanCell(v) { if (v === undefined || v === null) return ''; return String(v).replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim(); }

function findByNormalizedKey(row, wanted = []){
  if (!row || typeof row !== 'object') return undefined;
  const keys = Object.keys(row||{});
  for (const k of keys){
    const nk = String(k).trim().toLowerCase().replace(/\s+/g,'');
    for (const w of wanted){ if (nk === String(w).toLowerCase().replace(/\s+/g,'')) return row[k]; }
  }
  return undefined;
}
function getLocalizedField(row, baseNames = ['Country','Nationality'], lang = 'en'){
  if (!row) return '';
  for (const base of baseNames){
    const candidates = [base, `${base} (${lang})`, `${base}_${lang}`, `${base}-${lang}`].map(c=>c.toLowerCase().replace(/\s+/g,''));
    const found = findByNormalizedKey(row, candidates);
    if (found !== undefined) return cleanCell(found);
    const direct = row[base] ?? row[base.toLowerCase()];
    if (direct !== undefined && direct !== null) return cleanCell(direct);
  }
  return '';
}
function normalizeRow(raw){
  const r = raw || {};
  const composer = findByNormalizedKey(r, ['composer','композитор']) ?? r.Composer ?? '';
  const composerRussian = findByNormalizedKey(r, ['композитор']) ?? r['Композитор'] ?? '';
  const native = findByNormalizedKey(r, ['native']) ?? r.Native ?? '';
  const title = r['Title, Year'] ?? r.Title ?? '';
  const year = r.Year ?? r.year ?? '';
  const country = getLocalizedField(r, ['Country','Nationality'], 'en') || r.Country || r.Nationality || '';
  return { ...r, Composer: cleanCell(composer), Russian: cleanCell(composerRussian), Native: cleanCell(native), 'Title, Year': cleanCell(title), Title: cleanCell(title), Year: cleanCell(year), Country: cleanCell(country) };
}
export default function ComposersPage({ initialComposers = [], initialGender = 'Any' }){
  // Toggle to control whether the legacy in-page runtime should be allowed
  // to populate the composer panel. Set to `false` to disable any runtime
  // population while we iterate on the React panel and deploy safely.
  const RUNTIME_POPULATE_ENABLED = false;
  const [lang, setLang] = useState('en');
  const panelRef = useRef(null);
  // Local UI state for mobile composer panel (avoid relying only on globals)
  const [composerPanel, setComposerPanel] = useState({ open: false, name: '' });
  // track which composer button is being pressed for visual feedback
  const [activeButton, setActiveButton] = useState(null);
  // detect mobile on client only (avoid relying on window during SSR)
  const [isMobile, setIsMobile] = useState(false);
  // flag to indicate we are running on the client (hydration complete)
  const [isClient, setIsClient] = useState(false);
  useEffect(()=>{ try{ setIsClient(true); }catch(_){} }, []);
  // Log when component hydrates on client so we can verify mounting
  useEffect(()=>{
    try{ console.log('[ComposersPage] mounted/hydrated, isClient=', isClient); }catch(_){}
  }, [isClient]);
  useEffect(() => {
    if (!isClient) return;
    function checkMobile(){ try{ setIsMobile(window.innerWidth <= 600); }catch(_){} }
    try{ checkMobile(); window.addEventListener('resize', checkMobile); }catch(_){ }
    return () => { try{ window.removeEventListener('resize', checkMobile); }catch(_){} };
  }, []);

  // NOTE: removed temporary pointerdown debug listener to avoid noisy console output in production.
  // Ensure global helper calls also open the React-managed composer panel.
  // This wraps any existing `window.openComposerFromName` so third-party scripts
  // (the heavier client runtime) can trigger the React overlay and we still
  // preserve the original behavior.
  useEffect(() => {
    if (!isClient) return;
    const orig = typeof window !== 'undefined' ? window.openComposerFromName : undefined;
    // helper: wait for an element to exist (polling) before proceeding
    function waitFor(selector, ms = 800){
      const start = Date.now();
      return new Promise((resolve) => {
        (function check(){
          try{ if (document.querySelector(selector)) return resolve(true); }catch(_){ }
          if (Date.now() - start > ms) return resolve(false);
          setTimeout(check, 40);
        })();
      });
    }
    try {
      // install wrapper that opens the React panel then invokes original helper
      window.openComposerFromName = function(name, row){
          try{ setComposerPanel({ open: true, name: String(name || '') }); }catch(_){ }
          // Only invoke the legacy runtime if explicitly enabled. When disabled
          // we intentionally avoid calling the original `openComposerFromName`
          // so the panel stays controlled solely by React and does not get
          // overwritten or populated by legacy scripts.
          if (RUNTIME_POPULATE_ENABLED) {
            (async function(){
              try{
                const ok = await waitFor('#composer-content', 1000);
                if (ok && typeof orig === 'function') {
                  try{ orig(name, row); }catch(_){ }
                } else if (!ok && typeof orig === 'function') {
                  // fallback: call after a short delay if element not found
                  try{ setTimeout(()=>{ try{ orig(name, row); }catch(_){} }, 120); }catch(_){ }
                }
              }catch(_){ if (typeof orig === 'function') try{ orig(name, row); }catch(_){} }
            })();
          }
        return true;
      };
    }catch(_){ }
    return () => {
      try{
        if (typeof orig === 'function') window.openComposerFromName = orig;
        else delete window.openComposerFromName;
      }catch(_){ }
    };
  }, [isClient]);
  useEffect(() => { if (!isClient) return; try { const v = window.localStorage.getItem('lang'); if (v) setLang(v); } catch (e) {} }, [isClient]);
  const translations = {
    en: { searchPlaceholder: 'Search (ignore diacritics)', showAll: 'Show all', compositions: 'Compositions', details: 'Details', all: 'All', unknown: 'Unknown' },
    ru: { searchPlaceholder: 'Поиск (игнорировать диакритику)', showAll: 'Показать все', compositions: 'Произведения', details: 'Подробнее', all: 'Все', unknown: 'Неизвестно' },
    de: { searchPlaceholder: 'Suche (Diakritika ignorieren)', showAll: 'Alle anzeigen', compositions: 'Kompositionen', details: 'Details', all: 'Alle', unknown: 'Unbekannt' }
  };
  const t = k => (translations[lang] && translations[lang][k]) ? translations[lang][k] : (translations.en[k] || k);
  const [data, setData] = useState((initialComposers || []).map(normalizeRow));
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [tempSearch, setTempSearch] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(() => { try { return (new URL(window.location.href)).searchParams.get('country') || 'All' } catch (e) { return 'All' } });
  const [selectedComposer, setSelectedComposer] = useState(() => { try { return (new URL(window.location.href)).searchParams.get('composer') || '' } catch (e) { return '' } });
  const [showAllTriggered, setShowAllTriggered] = useState(false);
  const [genderFilter, setGenderFilter] = useState(initialGender || 'Any');
  const [decadeFilter, setDecadeFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [openIndex, setOpenIndex] = useState(null);
  useEffect(() => {
    let mounted = true;
    async function fetchData(){
      setLoading(true);
      try {
        const res = await fetch('/api/sheets');
        const json = await res.json();
        if (!mounted) return;
        if (Array.isArray(json)) setData(json.map(normalizeRow));
      } catch (err){ console.error(err); }
      finally { if (mounted) setLoading(false); }
    }
    fetchData();
    return () => { mounted = false; };
  }, []);
  useEffect(()=>{
    if (!isClient) return;
    function onPop(){
      try{ const u=new URL(window.location.href); setSelectedComposer(u.searchParams.get('composer')||''); setSelectedCountry(u.searchParams.get('country')||'All'); }catch(e){}
    }
    window.addEventListener('popstate', onPop);
    return ()=> window.removeEventListener('popstate', onPop);
  },[isClient]);
  const q = normalizeStr(query || '');
  const filtered = useMemo(() => data.filter(row => {
    if (selectedCountry && selectedCountry !== 'All') { const rc = normalizeStr(row.Country || ''); if (!rc.includes(normalizeStr(selectedCountry))) return false; }
    if (selectedComposer && selectedComposer !== '' && selectedComposer !== 'All Composers') { const rc = normalizeStr(row.Composer || ''); if (!rc.includes(normalizeStr(selectedComposer))) return false; }
    if (q && q.length > 0) { const joined = normalizeStr(Object.values(row||{}).join(' ')); if (!joined.includes(q)) return false; }
    if (genderFilter && genderFilter !== 'Any') { const g = normalizeStr(row.Gender || row.gender || ''); if (!g.includes(normalizeStr(genderFilter))) return false; }
    if (decadeFilter && decadeFilter !== 'All') { const yr = String(row.Year || '').trim(); const parsed = parseInt(yr,10); if (!isFinite(parsed)) return false; const d = Math.floor(parsed/10)*10; if (`${d}s` !== decadeFilter) return false; }
    if (typeFilter && typeFilter !== 'All') { const tv = normalizeStr(row.Type || row.type || row.genre || ''); if (!tv.includes(normalizeStr(typeFilter))) return false; }
    return true;
  }), [data, selectedCountry, selectedComposer, q, genderFilter, decadeFilter, typeFilter]);
  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach(row => { const name = cleanCell(row.Composer || '') || t('unknown'); if (!map.has(name)) map.set(name, []); map.get(name).push(row); });
    return Array.from(map.entries()).map(([composer, rows]) => ({ composer, rows, titles: Array.from(new Set(rows.map(r => cleanCell(r['Title, Year'] || r.Title || '').trim()).filter(Boolean))) }));
  }, [filtered]);

  // Selected group lookup using normalized comparison to avoid diacritics/spacing mismatches
  const selectedGroup = useMemo(() => {
    try{
      if (!composerPanel || !composerPanel.name) return undefined;
      const target = normalizeStr(composerPanel.name || '');
      // Relax matching: allow partial/substring matches and token intersection
      // to handle diacritics, commas, ordering and extra spacing
      function tokensOf(s){ return (s||'').split(/[^\p{L}\p{N}]+/u).map(tt=>normalizeStr(tt)).filter(Boolean); }
      const targetTokens = tokensOf(target);
      const found = grouped.find(x => {
        const cand = normalizeStr(x.composer || '');
        if (!cand) return false;
        if (cand === target) return true;
        if (cand.includes(target) || target.includes(cand)) return true;
        // token intersection: if at least one meaningful token overlaps, consider it a match
        try{
          const ct = tokensOf(cand);
          const intersection = ct.filter(t => targetTokens.includes(t));
          if (intersection.length >= 1) return true;
        }catch(_){ }
        return false;
      });
      // Debugging aid when matching fails
      if (!found) {
        try{ console.debug('[ComposersPage] selectedGroup match failed', { requested: composerPanel.name, normalized: target, candidates: grouped.map(g=>g.composer).slice(0,30) }); }catch(_){}
      }
      return found;
    }catch(_){ return undefined; }
  }, [grouped, composerPanel?.name]);
  const composersList = useMemo(()=>{ const s=new Set(); data.forEach(r=>{ if(r.Composer) s.add(r.Composer); }); return ['All Composers', ...Array.from(s).sort((a,b)=>a.localeCompare(b))]; },[data]);
  const countriesList = useMemo(()=>{ const s=new Set(); data.forEach(r=>{ if(r.Country) s.add(r.Country); }); return ['All', ...Array.from(s).sort((a,b)=>a.localeCompare(b))]; },[data]);
  const genderList = ['Any', 'Male', 'Female', 'Other'];
  const decadeList = useMemo(()=>{
    const s = new Set();
    data.forEach(r => { const y = parseInt(r.Year, 10); if (isFinite(y)) s.add(Math.floor(y/10)*10 + 's'); });
    return ['All', ...Array.from(s).sort()];
  }, [data]);
  const typeList = useMemo(()=>{
    const s = new Set();
    data.forEach(r => { if (r.Type) s.add(r.Type); });
    return ['All', ...Array.from(s).sort((a,b)=>a.localeCompare(b))];
  }, [data]);
  function handleSearch() {
    setQuery(tempSearch);
  }
  function handleShowAll() {
    setQuery('');
    setSelectedCountry('All');
    setSelectedComposer('');
    setGenderFilter('Any');
    setDecadeFilter('All');
    setTypeFilter('All');
    setShowAllTriggered(true);
  }

  // Open composer page exactly like the desktop "More about this composer" link
  function openComposerLink(composer) {
    if (!composer) return;
    const href = `/composer/${encodeURIComponent(composer)}`;
    // Use a full navigation to match the anchor behavior exactly
    window.location.href = href;
  }

  // Try to invoke the heavy client runtime to populate the composer content.
  // The runtime may load after this component hydrates, so retry briefly.
  // Accepts an optional `row` to forward to the runtime helper. Passing the
  // row helps the runtime find the exact composer match in the sheet data.
  function tryPopulateComposerRuntime(name, row){
    if (!name) return;
    // If runtime population is disabled, do nothing (keep panel React-only)
    if (!RUNTIME_POPULATE_ENABLED) return;
    try{ if (typeof window !== 'undefined') window.selectedComposer = String(name || ''); }catch(_){ }
    let attempts = 0;
    const maxAttempts = 50; // ~5s with 100ms interval (more tolerant)
    const interval = 100;
    const iv = setInterval(()=>{
      attempts += 1;
      try{
        if (typeof window === 'undefined') return;
        // prefer the canonical openComposerFromName which also sets selectedComposer
        if (typeof window.openComposerFromName === 'function'){
          try{ window.openComposerFromName(name, row); clearInterval(iv); return; }catch(_){ }
        }
        if (typeof window.populateComposerBox === 'function'){
          try{ window.populateComposerBox(name, row); clearInterval(iv); return; }catch(_){ }
        }
      }catch(_){ }
      if (attempts >= maxAttempts) { try{ clearInterval(iv); }catch(_){} }
    }, interval);
  }
  // Close mobile composer panel on Escape
  useEffect(()=>{
    if (!isClient) return;
    function onKey(e){ if (e.key === 'Escape' && composerPanel.open) setComposerPanel({ open: false, name: '' }); }
    try{ document.addEventListener('keydown', onKey); }catch(_){ }
    return ()=>{ try{ document.removeEventListener('keydown', onKey); }catch(_){} };
  }, [composerPanel.open, isClient]);

  // If the panel opens but the runtime hasn't populated #composer-content,
  // retry a couple times and show a fallback message so the panel is never blank.
  useEffect(()=>{
    if (!isClient) return;
    let cancelled = false;
    if (!composerPanel.open) return;
    (async function(){
      // short initial wait to allow original call to proceed
      await new Promise(r=>setTimeout(r, 140));
      try{
        const el = document.querySelector('#composer-content');
        if (el && el.innerHTML && String(el.innerHTML).trim().length > 10) return; // already populated
        // retry runtime a couple times
        for (let i=0;i<3 && !cancelled;i++){
          tryPopulateComposerRuntime(composerPanel.name, null);
          await new Promise(r=>setTimeout(r, 220));
          const now = document.querySelector('#composer-content');
          if (now && now.innerHTML && String(now.innerHTML).trim().length > 10) return;
        }
        // still empty: insert a helpful fallback message
        try{
          const fallback = document.querySelector('#composer-content');
          if (fallback) fallback.innerHTML = `<div style="color:#f3e8ff;padding:6px;border-radius:6px;background:rgba(255,255,255,0.02)">No extra details available right now. Try again or open the full composer page.</div>`;
        }catch(_){}
      }catch(_){}
    })();
    return ()=>{ cancelled = true; };
  }, [composerPanel.open, composerPanel.name, isClient]);

  // Hide legacy runtime overlays on mobile so they don't show when React panel is hidden
  useEffect(() => {
    if (!isClient) return;
    function hideLegacyOverlays() {
      try {
        document.querySelectorAll('.overlay, .overlay-right-inner, .mobile-overlay.right').forEach(el => {
          try {
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
          } catch (_) { }
        });
      } catch (_) { }
    }

    function onResize() {
      try {
        if (window.innerWidth <= 600) hideLegacyOverlays();
      } catch (_) { }
    }

    // initial hide on mount if mobile
    try { if (window.innerWidth <= 600) hideLegacyOverlays(); } catch (_) { }
    window.addEventListener('resize', onResize);

    // Observe DOM mutations and re-hide overlays if they are re-inserted
    const mo = new MutationObserver(() => {
      try { if (window.innerWidth <= 600) hideLegacyOverlays(); } catch (_) { }
    });
    try { mo.observe(document.body, { childList: true, subtree: true }); } catch (_) { }

    return () => {
      try { window.removeEventListener('resize', onResize); } catch (_) { }
      try { mo.disconnect(); } catch (_) { }
    };
  }, [isClient]);
  return (
    <div>
      <SiteNavbar
        composersList={composersList}
        countriesList={countriesList}
        genderList={genderList}
        decadeList={decadeList}
        typeList={typeList}
        selectedComposer={selectedComposer}
        setSelectedComposer={setSelectedComposer}
        selectedCountry={selectedCountry}
        setSelectedCountry={setSelectedCountry}
        genderFilter={genderFilter}
        setGenderFilter={setGenderFilter}
        decadeFilter={decadeFilter}
        setDecadeFilter={setDecadeFilter}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        query={tempSearch}
        setQuery={setTempSearch}
        onSearch={handleSearch}
        onShowAll={handleShowAll}
      />
      <div className="banner-placeholder" style={{ width: '100%', maxWidth: 1920, height: 350, margin: '0 auto', background:'#efefef' }}></div>
      <div className="composers-list">
        {grouped.map((g, idx) => (
          <div
            key={g.composer || idx}
            className="composer-group"
            role="button"
            tabIndex={0}
            onKeyDown={(e)=>{ try{ if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setComposerPanel({ open: true, name: g.composer || '' }); const representative = (g.rows && g.rows.length) ? g.rows[0] : null; tryPopulateComposerRuntime(g.composer, representative); } }catch(_){} }}
            onClick={() => { try{ setComposerPanel({ open: true, name: g.composer || '' }); const representative = (g.rows && g.rows.length) ? g.rows[0] : null; tryPopulateComposerRuntime(g.composer, representative); }catch(_){} }}
            style={{ cursor: 'pointer' }}
          >
            <h3>{g.composer}</h3>
            <p><strong>{t('compositions')}</strong></p>
            <ul>{g.titles.map((tt, i) => (<li key={i}>{tt}</li>))}</ul>
            <p>
              <button
                type="button"
                className="about-badge"
                aria-label={`About ${g.composer}`}
                style={{ marginLeft: 10, fontSize: '0.9em', padding: '2px 6px', borderRadius: 4, background: '#eee', border: 'none', cursor: 'pointer', color: 'inherit' }}
                onPointerDown={() => { try{ setActiveButton(g.composer); console.debug('[composers] pointerdown badge', g.composer); }catch(_){} }}
                onPointerUp={() => { try{ setActiveButton(null); console.debug('[composers] pointerup badge', g.composer); }catch(_){} }}
                onPointerCancel={() => { try{ setActiveButton(null); }catch(_){} }}
                onPointerLeave={() => { try{ setActiveButton(null); }catch(_){} }}
                onClick={(e) => {
                  try{ e.stopPropagation(); }catch(_){}
                  try{ console.debug('[composers] about-badge onClick', g.composer); }catch(_){ }
                  try{ setComposerPanel({ open: true, name: g.composer || '' }); }catch(_){ }
                  // Attempt to invoke the authoritative client runtime so it can
                  // populate #composer-content. The runtime typically exposes
                  // `openComposerFromName` and/or `populateComposerBox`.
                  try{
                    // Try to find a representative row to forward to the runtime.
                    const representative = (g.rows && g.rows.length) ? g.rows[0] : null;
                    tryPopulateComposerRuntime(g.composer, representative);
                  }catch(_){ }
                }}
              >
                {t('details')}
              </button>
            </p>
          </div>
        ))}
      </div>
    {/* Mobile composer panel rendered by React state to avoid relying only on global shims */}
    {/* removed debug marker */}
  {composerPanel.open && (
        <div
          data-react-panel="1"
          role="dialog"
          aria-modal="true"
          aria-label={`Composer details for ${composerPanel.name}`}
          ref={panelRef}
          style={{
              position: 'fixed', top: 0, right: 0, width: '92vw', maxWidth: 420, height: '100vh', background: '#6b21a8', zIndex: 2147483647,
            boxShadow: '-6px 0 18px rgba(0,0,0,0.20)', display: 'flex', flexDirection: 'column', color: '#ffffff',
            transform: composerPanel.open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 220ms ease'
          }}
        >
          {/* Static header styled like filter panel */}
          <div style={{ padding: '12px 16px', background: '#6b21a8', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#ffffff', fontWeight: 600 }}>
            Composer
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <strong style={{ color: 'var(--accent)', fontSize: '1rem' }}>{composerPanel.name}</strong>
            </div>
            <button aria-label="Close composer panel" onClick={()=>setComposerPanel({ open: false, name: '' })} style={{ border: 0, background: 'transparent', fontSize: '1.1rem', cursor: 'pointer', color: '#ffffff' }}>✕</button>
          </div>
      <div style={{ padding: 12, overflow: 'auto', flex: '1 1 auto' }}>
        <div id="composer-content" style={{ color: '#ffffff', minHeight: '40vh', background: 'transparent' }}>
              {/* Minimal content: list composer titles if available */}
              {selectedGroup ? (
                <div>
                  <h4 style={{ marginTop: 0 }}>Works</h4>
                  <ul>
                    { (selectedGroup.titles || []).slice(0,20).map((tt,i)=> (<li key={i}>{tt}</li>)) }
                  </ul>
                </div>
              ) : (
                <div style={{ color: '#6b7280' }}>Loading details…</div>
              )}
            </div>
            <div id="more-from-composer" style={{ marginTop: 12 }} />
          </div>
        </div>
      )}
  {/* Composer mobile panel: React panel now renders on all viewports. */}
    </div>
  );
}
