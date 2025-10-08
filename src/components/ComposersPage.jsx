import React, { useState, useEffect, useMemo } from 'react';
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
  const [lang, setLang] = useState('en');
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

  // Debug helper: capture-phase pointerdown logger to detect if taps are intercepted.
  useEffect(()=>{
    if (!isClient) return;
    let calls = 0;
    const maxCalls = 12;
    let timeoutId = null;
    function handler(e){
      try{
        calls += 1;
        const el = e.target;
        let outer = '';
        try{ outer = el && el.outerHTML ? String(el.outerHTML).slice(0, 800) : String(el); }catch(_){ outer = String(el); }
        // Use warn so it shows prominently in many consoles
        console.warn('[composer-debug] pointerdown target snippet:', outer);
        if (calls >= maxCalls){ document.removeEventListener('pointerdown', handler, true); console.warn('[composer-debug] removed pointerdown capture listener after max events'); if (timeoutId) clearTimeout(timeoutId); }
      }catch(err){ console.warn('[composer-debug] handler error', err); }
    }
    try{
      document.addEventListener('pointerdown', handler, true);
      // safety: remove after 30s
      timeoutId = setTimeout(()=>{ try{ document.removeEventListener('pointerdown', handler, true); console.warn('[composer-debug] removed pointerdown capture listener after timeout'); }catch(_){} }, 30000);
    }catch(_){ }
    return ()=>{ try{ document.removeEventListener('pointerdown', handler, true); if (timeoutId) clearTimeout(timeoutId); }catch(_){} };
  }, []);
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
        // ensure the React-rendered #composer-content exists before calling the heavy runtime
        (async function(){
          try{
            const ok = await waitFor('#composer-content', 1000);
            if (ok && typeof orig === 'function') {
              try{ orig(name, row); }catch(_){ }
            } else if (!ok && typeof orig === 'function') {
              // fallback: call after a short delay if element not found
              try{ setTimeout(()=>{ try{ orig(name, row); }catch(_){} }, 120); }catch(_){}
            }
          }catch(_){ if (typeof orig === 'function') try{ orig(name, row); }catch(_){} }
        })();
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
  // Close mobile composer panel on Escape
  useEffect(()=>{
    if (!isClient) return;
    function onKey(e){ if (e.key === 'Escape' && composerPanel.open) setComposerPanel({ open: false, name: '' }); }
    try{ document.addEventListener('keydown', onKey); }catch(_){ }
    return ()=>{ try{ document.removeEventListener('keydown', onKey); }catch(_){} };
  }, [composerPanel.open, isClient]);
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
          <div key={g.composer || idx} className="composer-group">
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
                onClick={() => {
                  try{ console.debug('[composers] about-badge onClick', g.composer); }catch(_){ }
                  try{ setComposerPanel({ open: true, name: g.composer || '' }); }catch(_){ }
                  // Attempt to invoke the authoritative client runtime so it can
                  // populate #composer-content. The runtime typically exposes
                  // `openComposerFromName` and/or `populateComposerBox`.
                  try{
                    if (typeof window !== 'undefined' && typeof window.openComposerFromName === 'function'){
                      // call the wrapped helper; it will forward to the original runtime when available
                      try{ window.openComposerFromName(g.composer); }catch(_){}
                    }
                    // as a fallback, call the populate helper directly if present
                    if (typeof window !== 'undefined' && typeof window.populateComposerBox === 'function'){
                      // give the React panel a moment to render its DOM
                      setTimeout(()=>{ try{ window.populateComposerBox(g.composer); }catch(_){} }, 80);
                    }
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
      {composerPanel.open && (
        /* debug marker to confirm the panel renders */
        <div style={{ position: 'fixed', top: 8, left: 8, width: 28, height: 28, background: 'red', zIndex: 99999, borderRadius: 4 }} />
      )}
      {composerPanel.open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Composer details for ${composerPanel.name}`}
          style={{
            position: 'fixed', top: 0, right: 0, width: '92vw', maxWidth: 420, height: '100vh', background: '#fff', zIndex: 2200,
            boxShadow: '-6px 0 18px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column',
            transform: composerPanel.open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 220ms ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #eef2f6' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', lineHeight: '1' }}>Composer</div>
              <strong style={{ color: 'var(--accent)', fontSize: '1rem' }}>{composerPanel.name}</strong>
            </div>
            <button aria-label="Close composer panel" onClick={()=>setComposerPanel({ open: false, name: '' })} style={{ border: 0, background: 'transparent', fontSize: '1.1rem', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ padding: 12, overflow: 'auto', flex: '1 1 auto' }}>
              <div id="composer-content" style={{ color: '#111' }}>
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
    </div>
  );
}
