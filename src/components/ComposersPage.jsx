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
  useEffect(() => { try { const v = window.localStorage.getItem('lang'); if (v) setLang(v); } catch {} }, []);
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
  const [selectedCountry, setSelectedCountry] = useState(() => { try { return (new URL(window.location.href)).searchParams.get('country') || 'All' } catch { return 'All' } });
  const [selectedComposer, setSelectedComposer] = useState(() => { try { return (new URL(window.location.href)).searchParams.get('composer') || '' } catch { return '' } });
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
    function onPop(){
      try{ const u=new URL(window.location.href); setSelectedComposer(u.searchParams.get('composer')||''); setSelectedCountry(u.searchParams.get('country')||'All'); }catch(e){}
    }
    window.addEventListener('popstate', onPop);
    return ()=> window.removeEventListener('popstate', onPop);
  },[]);
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
            <p><a href={`/composer/${encodeURIComponent(g.composer)}`}>{t('details')}</a></p>
          </div>
        ))}
      </div>
    </div>
  );
}
