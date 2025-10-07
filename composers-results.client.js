// Client script for composers-results page
// Extracted and cleaned. Provides filters, pagination, sheet fetching and composer details.
(function(){
  // Lightweight runtime diagnostics to help debug blank page issues
  try{
    console.log('[composers-results] client script loaded');
    window.addEventListener('error', function(ev){
      try{
        console.error('[composers-results] uncaught error', ev.error || ev.message || ev);
        const rl = document.getElementById('results-list');
        if (rl) rl.innerText = 'Client error: ' + String(ev.message || (ev.error && ev.error.message) || ev.error || ev);
        const cc = document.getElementById('composer-content'); if (cc) cc.innerText = 'Client error: see console';
      }catch(_){ /* ignore */ }
    });
    // visible debug badge so users can see client status without DevTools
    try{
  const badge = document.createElement('div');
  badge.id = 'cr-debug';
  badge.dataset.clientVersion = 'v2';
      badge.style.position = 'fixed';
      badge.style.right = '12px';
      badge.style.top = '72px';
      badge.style.zIndex = '9999';
      badge.style.background = 'rgba(0,0,0,0.6)';
      badge.style.color = '#fff';
      badge.style.padding = '6px 8px';
      badge.style.borderRadius = '6px';
      badge.style.fontSize = '12px';
      badge.style.fontFamily = 'system-ui,Segoe UI,Roboto,Arial';
  badge.textContent = 'client: loaded (v2)';
      document.body.appendChild(badge);
    }catch(_){ }
  }catch(_){ /* ignore */ }
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q') || '';
  const qinput = document.getElementById('qinput');
  if (qinput) {
    qinput.placeholder = 'Search composers, countries, or pieces...';
    qinput.value = decodeURIComponent(q);
  }

  const langBtn = document.getElementById('langBtn');
  const langDropdown = document.getElementById('langDropdown');
  if (langBtn && langDropdown){
    langBtn.addEventListener('click', ()=>{ langDropdown.classList.toggle('open'); langBtn.setAttribute('aria-expanded', String(langDropdown.classList.contains('open'))); });
    langDropdown.addEventListener('click', (e)=>{ const opt = e.target.closest('.lang-option'); if (!opt) return; const locale = opt.dataset.locale; try{ localStorage.setItem('locale', locale); }catch(e){} window.location.reload(); });
    document.addEventListener('click', (e)=>{ if (!langBtn.contains(e.target) && !langDropdown.contains(e.target)) langDropdown.classList.remove('open'); });
  }

  function normalize(s){ if(!s) return ''; try{ return s.toString().normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase(); }catch(e){ return s.toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); } }
  function escapeHtml(str){ if (str == null) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  // Debug panel: visible runtime diagnostics
  function ensureDebugPanel(){
    try{
      let p = document.getElementById('cr-debug-panel');
      if (!p){
        p = document.createElement('div');
        p.id = 'cr-debug-panel';
        p.style.position = 'fixed';
        p.style.left = '12px';
        p.style.bottom = '72px';
        p.style.zIndex = 99999;
        p.style.background = 'rgba(255,255,255,0.95)';
        p.style.border = '1px solid #eee';
        p.style.padding = '8px 10px';
        p.style.borderRadius = '8px';
        p.style.maxWidth = '360px';
        p.style.fontSize = '13px';
        p.style.color = '#111';
        p.style.boxShadow = '0 6px 18px rgba(0,0,0,0.06)';
        p.innerHTML = '<strong>client debug</strong><div id="cr-debug-body" style="margin-top:6px;font-size:12px;color:#333">initializing…</div>';
        document.body.appendChild(p);
      }
      return document.getElementById('cr-debug-body');
    }catch(e){ return null; }
  }
  function updateDebugPanel(info){
    try{
      const el = ensureDebugPanel(); if (!el) return;
      const lines = [];
      if (info.apiRows !== undefined) lines.push('apiRows: ' + info.apiRows);
      if (info.filtered !== undefined) lines.push('filtered: ' + info.filtered);
      if (info.page !== undefined) lines.push('page: ' + info.page);
      if (info.error) lines.push('error: ' + info.error);
      if (info.note) lines.push(info.note);
      el.innerText = lines.join('\n');
    }catch(e){ /* ignore */ }
  }

  async function gvizFetch(sheetName, range = 'A1:Z1000'){
    try{
      const id = '1UiK8QDq98C-9wCpQjdQAVpSdH8mZkpxYgMMEHM3uaGk';
      const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&range=${encodeURIComponent(range)}`;
      const txt = await (await fetch(url)).text();
      const m = txt.match(/google\.visualization\.Query\.setResponse\((.*)\);?/s);
      if (!m || !m[1]) return null;
      if (!content) return;
      if (!name){ 
        content.innerHTML = 'Select a result to view composer details.'; 
        if (clearBtn) clearBtn.style.display = 'none'; 
        return; 
      }
      const cols = (json.table.cols || []).map(c => (c && (c.label || c.id)) ? String(c.label || c.id) : '');
      const rows = (json.table.rows || []).map(r => (r.c || []).map(cell => (cell && cell.v !== undefined && cell.v !== null) ? cell.v : ''));
      return { cols, rows };
    }catch(_){ return null; }
  }

  // Helper: read a value from a row by column letter (A=0 -> index 0). Works with
  // array rows (gviz style) and object rows (api/sheets returns objects keyed by header).
  function getByLetterFromRow(row, letter){
    try{
      if (!row) return '';
      const L = (letter || '').toString().toUpperCase();
      const idx = L.length ? (L.charCodeAt(0) - 65) : null; // A->0, B->1, ...
      if (Array.isArray(row)){
        if (idx !== null && idx >= 0 && idx < row.length) return row[idx] != null ? String(row[idx]) : '';
        return '';
      }
      if (typeof row === 'object'){
        const keys = Object.keys(row || {});
        // try some canonical header names first (case-insensitive)
        const canonical = ['Soviet republic','Soviet Republic','Soviet','Republic','Republic (EN)','republic','Soviet republic (EN)','SovietRepublic','Republic/Region','Region'];
        for (const want of canonical){
          const found = keys.find(k => (k || '').toString().toLowerCase().trim() === (want || '').toString().toLowerCase().trim());
          if (found) return row[found] != null ? String(row[found]) : '';
        }
        // fallback: look for any key that contains the word 'republic' or 'soviet'
        const contains = keys.find(k => { const kk = (k||'').toString().toLowerCase(); return kk.includes('republic') || kk.includes('soviet'); });
        if (contains) return row[contains] != null ? String(row[contains]) : '';
        // try generated column keys from gviz fallback (col_0, col_1 ...)
        if (idx !== null){
          const colKey = 'col_' + idx; if (colKey in row) return row[colKey] != null ? String(row[colKey]) : '';
          const colKeyOne = 'col_' + (idx + 1); if (colKeyOne in row) return row[colKeyOne] != null ? String(row[colKeyOne]) : '';
          const colKeyAlt = 'col' + idx; if (colKeyAlt in row) return row[colKeyAlt] != null ? String(row[colKeyAlt]) : '';
        }
        // try if someone used the letter as a key
        if (L in row) return row[L] != null ? String(row[L]) : '';
        // last resort: return first value that looks like a soviet republic (heuristic)
        for (const k of keys){ const v = row[k]; if (v && typeof v === 'string' && v.toLowerCase().includes('sov')) return String(v); }
        return '';
      }
    }catch(e){ return ''; }
    return '';
  }

  // state
  window.PAGE_SIZE = 25;
  window.currentPage = 1;
  window.lastFiltered = [];
  window.selectedComposer = '';
  window.lastAppliedFilter = null;
  window.lastRowsJson = null;
  window.POLL_INTERVAL = 30000;
  window.liveTimer = null;

  window.populateCountryCheckboxes = async function(){
    const container = document.getElementById('filter-country');
    if (!container) return;
    const fallbackCountries = ['Russia','Ukraine','Belarus','Armenia','Georgia','Latvia','Estonia','Lithuania','Kazakhstan','Uzbekistan','Other'];
    try{
      const res = await fetch('/i18n/translations.json');
      const json = await res.json();
      const en = json && json.en ? json.en : null;
      const canonical = en && en.countries ? en.countries : fallbackCountries;
      const locale = (function(){ try{ return localStorage.getItem('locale') || 'en'; }catch(e){ return 'en'; } })();
      const localized = (json && json[locale] && json[locale].countries) ? json[locale].countries : canonical;
      container.innerHTML = '';
      for (let i=0;i<canonical.length;i++){
        const val = canonical[i];
        const lab = (localized && localized[i]) ? localized[i] : val;
        const id = 'country_cb_' + i;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `<label style="display:block;margin-bottom:6px;"><input type="checkbox" data-val="${encodeURIComponent(val)}" id="${id}" /> ${lab}</label>`;
        container.appendChild(wrapper);
      }
      const controls = document.createElement('div');
      controls.style.marginTop = '8px';
      controls.innerHTML = `<button id="country-select-all" style="margin-right:6px;padding:4px 8px;border-radius:6px;border:1px solid #d1d5db;background:#fff;">Select All</button><button id="country-clear" style="padding:4px 8px;border-radius:6px;border:1px solid #d1d5db;background:#fff;">Clear</button>`;
      container.appendChild(controls);
  container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.addEventListener('change', (e)=>{ try{ const val = decodeURIComponent(cb.dataset.val || cb.getAttribute('data-val')||''); window.lastAppliedFilter = { kind: 'country', value: val }; }catch(_){} window.currentPage = 1; window.loadResults(); }));
      const selAll = document.getElementById('country-select-all');
      const clr = document.getElementById('country-clear');
  if (selAll) selAll.addEventListener('click', ()=>{ window.lastAppliedFilter = null; container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked = true); window.currentPage = 1; window.loadResults(); });
  if (clr) clr.addEventListener('click', ()=>{ window.lastAppliedFilter = null; container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked = false); window.currentPage = 1; window.loadResults(); });
    }catch(e){
      container.innerHTML = fallbackCountries.map((c,i)=>`<label style="display:block;margin-bottom:6px;"><input type="checkbox" data-val="${encodeURIComponent(c)}" id="country_cb_f${i}" /> ${c}</label>`).join('');
      const controlsWrap = document.createElement('div');
      controlsWrap.style.marginTop = '8px';
      controlsWrap.innerHTML = `<button id="country-select-all" style="margin-right:6px;padding:4px 8px;border-radius:6px;border:1px solid #d1d5db;background:#fff;">Select All</button><button id="country-clear" style="padding:4px 8px;border-radius:6px;border:1px solid #d1d5db;background:#fff;">Clear</button>`;
      container.appendChild(controlsWrap);
  container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.addEventListener('change', (e)=>{ try{ const val = decodeURIComponent(cb.dataset.val || cb.getAttribute('data-val')||''); window.lastAppliedFilter = { kind: 'decade', value: val }; }catch(_){} window.currentPage = 1; window.loadResults(); }));
    }
  };

  async function populateDecadeCheckboxes(){
    const container = document.getElementById('filter-decade');
    if (!container) return;
    const fallbackDecades = ['1920s','1930s','1940s','1950s','1960s','1970s','1980s'];
    try{
      const res = await fetch('/i18n/translations.json');
      const json = await res.json();
      const en = json && json.en ? json.en : null;
      const canonical = en && en.decades ? en.decades : fallbackDecades;
      const locale = (function(){ try{ return localStorage.getItem('locale') || 'en'; }catch(e){ return 'en'; } })();
      const localized = (json && json[locale] && json[locale].decades) ? json[locale].decades : canonical;
      container.innerHTML = '';
      const title = document.createElement('div'); title.className = 'list-title'; title.textContent = 'Decade'; container.appendChild(title);
      for (let i=0;i<canonical.length;i++){
        const val = canonical[i];
        const lab = (localized && localized[i]) ? localized[i] : val;
        const id = 'decade_cb_' + i;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `<label style="display:block;margin-bottom:6px;"><input type="checkbox" data-val="${encodeURIComponent(val)}" id="${id}" /> ${lab}</label>`;
        container.appendChild(wrapper);
      }
      const controls = document.createElement('div'); controls.style.marginTop = '8px'; controls.innerHTML = `<button id="decade-select-all" style="margin-right:6px;padding:4px 8px;border-radius:6px;border:1px solid #d1d5db;background:#fff;">Select All</button><button id="decade-clear" style="padding:4px 8px;border-radius:6px;border:1px solid #d1d5db;background:#fff;">Clear</button>`; container.appendChild(controls);
      container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.addEventListener('change', ()=>{ window.currentPage = 1; window.loadResults(); }));
      const selAll = document.getElementById('decade-select-all');
      const clr = document.getElementById('decade-clear');
  if (selAll) selAll.addEventListener('click', ()=>{ window.lastAppliedFilter = null; container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked = true); window.currentPage = 1; window.loadResults(); });
  if (clr) clr.addEventListener('click', ()=>{ window.lastAppliedFilter = null; container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked = false); window.currentPage = 1; window.loadResults(); });
    }catch(e){
      container.innerHTML = '';
      const title = document.createElement('div'); title.className = 'list-title'; title.textContent = 'Decade'; container.appendChild(title);
      container.innerHTML += fallbackDecades.map((d,i)=>`<label style="display:block;margin-bottom:6px;"><input type="checkbox" data-val="${encodeURIComponent(d)}" id="decade_cb_f${i}" /> ${d}</label>`).join('');
      const controlsWrap = document.createElement('div'); controlsWrap.style.marginTop = '8px'; controlsWrap.innerHTML = `<button id="decade-select-all" style="margin-right:6px;padding:4px 8px;border-radius:6px;border:1px solid #d1d5db;background:#fff;">Select All</button><button id="decade-clear" style="padding:4px 8px;border-radius:6px;border:1px solid #d1d5db;background:#fff;">Clear</button>`; container.appendChild(controlsWrap);
      container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.addEventListener('change', ()=>{ window.currentPage = 1; window.loadResults(); }));
    }
  }
  window.populateDecadeCheckboxes = populateDecadeCheckboxes;

  async function populateTypeCheckboxes(){
    const container = document.getElementById('filter-type');
    if (!container) return;
    container.innerHTML = '';
    try{
      const resT = await fetch('/i18n/translations.json');
      const jsonT = await resT.json();
      const en = jsonT && jsonT.en ? jsonT.en : null;
      const canonicalTypes = en && en.types ? en.types : null;
      if (canonicalTypes && canonicalTypes.length){
        const locale = (function(){ try{ return localStorage.getItem('locale') || 'en'; }catch(e){ return 'en'; } })();
        const localized = (jsonT && jsonT[locale] && jsonT[locale].types) ? jsonT[locale].types : canonicalTypes;
        container.innerHTML = '';
        const title = document.createElement('div'); title.className = 'list-title'; title.textContent = 'Type of piece'; container.appendChild(title);
        canonicalTypes.forEach((val,i)=>{
          const lab = localized && localized[i] ? localized[i] : val;
          const id = 'type_cb_' + i;
          const wrapper = document.createElement('div');
          wrapper.innerHTML = `<label style="display:block;margin-bottom:6px;"><input type="checkbox" data-val="${encodeURIComponent(val)}" id="${id}" /> ${lab}</label>`;
          container.appendChild(wrapper);
        });
        const controls = document.createElement('div'); controls.style.marginTop = '8px'; controls.innerHTML = `<button id="type-select-all" style="margin-right:6px;padding:4px 8px;border-radius:6px;border:1px solid #d1d5db;background:#fff;">Select All</button><button id="type-clear" style="padding:4px 8px;border-radius:6px;border:1px solid #d1d5db;background:#fff;">Clear</button>`; container.appendChild(controls);
  container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.addEventListener('change', (e)=>{ try{ const val = decodeURIComponent(cb.dataset.val || cb.getAttribute('data-val')||''); window.lastAppliedFilter = { kind: 'type', value: val }; }catch(_){} window.currentPage = 1; window.loadResults(); }));
        const selAll = document.getElementById('type-select-all');
        const clr = document.getElementById('type-clear');
        if (selAll) selAll.addEventListener('click', ()=>{ container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked = true); window.currentPage = 1; window.loadResults(); });
        if (clr) clr.addEventListener('click', ()=>{ container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked = false); window.currentPage = 1; window.loadResults(); });
        return;
      }
      const res = await fetch('/api/sheets', { headers: { 'Accept': 'application/json' } });
      const raw = await res.json().catch(()=>null);
      const rows = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.rows) ? raw.rows : raw);
      const set = new Set();
      (rows || []).forEach(r => { const t = r.Type || r.type || r['Type of piece'] || r['Type'] || ''; if (t) set.add(String(t).trim()); });
      const list = Array.from(set).sort();
      container.innerHTML = '';
      const titleDyn = document.createElement('div'); titleDyn.className = 'list-title'; titleDyn.textContent = 'Type of piece'; container.appendChild(titleDyn);
      const controls = document.createElement('div'); controls.style.marginTop = '8px'; controls.innerHTML = `<button id="type-select-all" style="margin-right:6px;padding:4px 8px;border-radius:6px;border:1px solid #d1d5db;background:#fff;">Select All</button><button id="type-clear" style="padding:4px 8px;border-radius:6px;border:1px solid #d1d5db;background:#fff;">Clear</button>`; container.appendChild(controls);
      list.forEach((val,i)=>{
        const id = 'type_cb_dyn_' + i;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `<label style="display:block;margin-bottom:6px;"><input type="checkbox" data-val="${encodeURIComponent(val)}" id="${id}" /> ${val}</label>`;
        container.appendChild(wrapper);
      });
      container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.addEventListener('change', ()=>{ window.currentPage = 1; window.loadResults(); }));
      const selAll = document.getElementById('type-select-all');
      const clr = document.getElementById('type-clear');
  if (selAll) selAll.addEventListener('click', ()=>{ window.lastAppliedFilter = null; container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked = true); window.currentPage = 1; window.loadResults(); });
  if (clr) clr.addEventListener('click', ()=>{ window.lastAppliedFilter = null; container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked = false); window.currentPage = 1; window.loadResults(); });
    }catch(e){ container.innerHTML = ''; }
  }
  window.populateTypeCheckboxes = populateTypeCheckboxes;

  function renderPage(page){
    const container = document.getElementById('results-list');
    if (!container) return;
    container.innerHTML = '';
    const start = (page - 1) * window.PAGE_SIZE;
    const pageItems = (window.lastFiltered || []).slice(start, start + window.PAGE_SIZE);
    if (!pageItems.length) {
      container.innerHTML = '<div class="result-card">No results</div>';
      // still render pagination so users can navigate (handles case where currentPage is out of range)
      const totalPages = Math.max(1, Math.ceil(((window.lastFiltered || []).length || 0) / window.PAGE_SIZE));
      renderPagination(totalPages, page);
      return;
    }
    pageItems.forEach(r =>{
      const div = document.createElement('div');
      div.className = 'result-card';
      // map columns: A => bold primary (e.g., title), J => composer (clickable), K => year/info
      const colA = escapeHtml(getByLetterFromRow(r, 'A') || r.Title || r.title || '');
      const colJ = escapeHtml(getByLetterFromRow(r, 'J') || r['Composer'] || r.Composer || r.composer || '');
      const colK = escapeHtml(getByLetterFromRow(r, 'K') || r.Year || r.Published || r.Decade || r.year || '');
      const composerData = encodeURIComponent(String(getByLetterFromRow(r, 'J') || r['Composer'] || r.Composer || r.composer || ''));
      div.innerHTML = `<div class="result-main"><b>${colA}</b><div style="margin-top:6px"><a href="#" class="composer-link" data-name="${composerData}">${colJ || 'Unknown'}</a> ${colK ? '(' + colK + ')' : ''}</div></div><div class="result-right"><a href="#" class="view-link">View</a></div>`;
      container.appendChild(div);
      const link = div.querySelector('.composer-link');
      if (link){
        link.addEventListener('click', (e)=>{
          e.preventDefault();
          const name = decodeURIComponent(link.dataset.name || '');
          window.selectedComposer = name || '';
          populateComposerBox(name, r);
          window.currentPage = 1;
          window.loadResults();
        });
      }
      const view = div.querySelector('.view-link');
      if (view){ view.addEventListener('click', (e)=>{ e.preventDefault(); const name = decodeURIComponent(composerData||''); window.selectedComposer = name || ''; populateComposerBox(name, r); }); }
    });
    renderPagination(Math.ceil((window.lastFiltered || []).length / window.PAGE_SIZE), page);
  }

  function renderPagination(pageCount, active){
    let pag = document.getElementById('pagination');
    if (pag) pag.remove();
    // prefer explicit pagination roots, fallback to panel center
    const pagRoot = document.getElementById('results-pagination-top') || document.getElementById('panel-center');
    const pagBottom = document.getElementById('results-pagination-bottom');
    // support both #results (older markup) and #results-list (current markup)
    const resultsEl = document.getElementById('results') || document.getElementById('results-list');
    if (!resultsEl || !pagRoot) return;
  pag = document.createElement('div');
    pag.id = 'pagination';
    pag.className = 'pagination';
  try{ const bd = document.getElementById('cr-debug'); if (bd) bd.textContent = `client: ${ (window.lastFiltered || []).length } results · pages: ${pageCount} · page: ${active}`; }catch(_){ }
    function clearAllFilters(){
      try{
        const qinput = document.getElementById('qinput'); if (qinput) qinput.value = '';
        window.selectedComposer = '';
        window.lastAppliedFilter = null;
        const clearComposerBtn = document.getElementById('clear-composer'); if (clearComposerBtn) clearComposerBtn.style.display = 'none';
        const composerContent = document.getElementById('composer-content'); if (composerContent) composerContent.innerHTML = 'Select a result to view composer details.';
        document.querySelectorAll('#filter-country input[type=checkbox], #filter-republic input[type=checkbox], #filter-decade input[type=checkbox], #filter-type input[type=checkbox]').forEach(cb=> cb.checked = false);
        window.currentPage = 1;
        window.loadResults();
      }catch(e){ console.error('clearAllFilters failed', e); }
    }
    if (pageCount === 1){
      pagRoot.innerHTML = '';
      const phWrap = document.createElement('div'); phWrap.style.display='flex'; phWrap.style.alignItems='center'; phWrap.style.gap='8px'; phWrap.style.justifyContent='flex-end';
      const placeholder = document.createElement('div'); placeholder.style.color='#6b7280'; placeholder.style.paddingRight='6px'; placeholder.textContent='1 of 1';
      const clearBtn = document.createElement('button'); clearBtn.textContent='Clear all filters'; clearBtn.className = 'page-btn'; clearBtn.style.padding='6px 10px'; clearBtn.style.borderRadius='6px'; clearBtn.style.border='1px solid #d1d5db'; clearBtn.style.background='#fff'; clearBtn.addEventListener('click', clearAllFilters);
      phWrap.appendChild(placeholder); phWrap.appendChild(clearBtn);
      const liveToggle = document.createElement('button'); liveToggle.textContent='Live: Off'; liveToggle.style.marginLeft='8px'; liveToggle.style.padding='6px 10px'; liveToggle.style.borderRadius='6px'; liveToggle.addEventListener('click', ()=>{ if (window.liveTimer){ stopLiveUpdates(); liveToggle.textContent='Live: Off'; } else { startLiveUpdates(); liveToggle.textContent='Live: On'; }});
      phWrap.appendChild(liveToggle); pagRoot.appendChild(phWrap); return;
    }
    const prev = document.createElement('button'); prev.textContent='Prev'; prev.className = 'page-btn'; prev.disabled = active === 1; prev.addEventListener('click', ()=>{ if (window.currentPage>1){ window.currentPage--; renderPage(window.currentPage); window.scrollTo({top:0,behavior:'smooth'}); }}); pag.appendChild(prev);
    const maxButtons = 7; const half = Math.floor(maxButtons/2); let start = Math.max(1, active - half); let end = Math.min(pageCount, start + maxButtons -1); if (end - start < maxButtons -1) start = Math.max(1, end - maxButtons +1);
    for (let i=start;i<=end;i++){ const b = document.createElement('button'); b.textContent = String(i); b.className = 'page-btn'; if (i===active) { b.setAttribute('aria-current','true'); } b.addEventListener('click', ()=>{ window.currentPage = i; renderPage(window.currentPage); window.scrollTo({top:0,behavior:'smooth'}); }); pag.appendChild(b); }
    const next = document.createElement('button'); next.textContent = 'Next'; next.className = 'page-btn'; next.disabled = active >= pageCount; next.addEventListener('click', ()=>{ if (window.currentPage<pageCount){ window.currentPage++; renderPage(window.currentPage); window.scrollTo({top:0,behavior:'smooth'}); }}); pag.appendChild(next);
    pagRoot.innerHTML = '';
    const topWrap = document.createElement('div'); topWrap.style.display='flex'; topWrap.style.alignItems='center'; topWrap.style.gap='8px'; topWrap.style.justifyContent='flex-end';
    const clearBtn2 = document.createElement('button'); clearBtn2.textContent='Clear all filters'; clearBtn2.style.padding='6px 10px'; clearBtn2.style.borderRadius='6px'; clearBtn2.style.border='1px solid #d1d5db'; clearBtn2.style.background='#fff'; clearBtn2.addEventListener('click', clearAllFilters);
    topWrap.appendChild(clearBtn2);
    const liveToggle2 = document.createElement('button'); liveToggle2.textContent = window.liveTimer ? 'Live: On' : 'Live: Off'; liveToggle2.style.marginRight='8px'; liveToggle2.style.padding='6px 10px'; liveToggle2.style.borderRadius='6px'; liveToggle2.addEventListener('click', ()=>{ if (window.liveTimer) { stopLiveUpdates(); liveToggle2.textContent='Live: Off'; } else { startLiveUpdates(); liveToggle2.textContent='Live: On'; } }); topWrap.appendChild(liveToggle2);
    topWrap.appendChild(pag); pagRoot.appendChild(topWrap);
      if (pagBottom) {
          pagBottom.innerHTML = '';
          const bottomWrap = document.createElement('div'); bottomWrap.style.display='flex'; bottomWrap.style.alignItems='center'; bottomWrap.style.gap='8px'; bottomWrap.style.justifyContent='flex-end';
          bottomWrap.appendChild(pag.cloneNode(true)); // Clone the pagination for the bottom
          pagBottom.appendChild(bottomWrap);
      }
  }

  async function pollOnce(){
    try{
      const res = await fetch('/api/sheets', { headers: { 'Accept': 'application/json' } });
      const raw = await res.json().catch(()=>null);
      const rows = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.rows) ? raw.rows : raw);
      const rowsJson = JSON.stringify(rows);
      if (window.lastRowsJson !== rowsJson){ window.lastRowsJson = rowsJson; window.loadResults(rows, { resetPage: false }); }
    }catch(e){ console.error('poll failed', e); }
  }
  function startLiveUpdates(){ if (window.liveTimer) return; window.liveTimer = setInterval(pollOnce, window.POLL_INTERVAL); pollOnce(); }
  function stopLiveUpdates(){ if (!window.liveTimer) return; clearInterval(window.liveTimer); window.liveTimer = null; }

  async function loadResults(rowsParam, options = { resetPage: true }){
    try{
      let rows = rowsParam;
      if (!rows){
        const res = await fetch('/api/sheets', { headers: { 'Accept': 'application/json' } });
        const raw = await res.json().catch(()=>null);
        rows = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.rows) ? raw.rows : raw);
      }
      try{ window.lastApiRowsCount = Array.isArray(rows) ? rows.length : 0; }catch(_){ window.lastApiRowsCount = 0; }
      if (!Array.isArray(rows)){
        try{
          const g = await gvizFetch('MusicList');
          if (g && g.rows && g.rows.length){
            const headers = g.cols.map((h,i) => h && String(h).trim() ? String(h).trim() : `col_${i}`);
            rows = g.rows.map(r => { const o={}; for(let i=0;i<headers.length;i++){ o[headers[i]] = r[i] !== undefined && r[i] !== null ? r[i] : ''; } return o; });
          } else {
            const errText = typeof rows === 'object' ? JSON.stringify(rows) : String(rows);
            const resultsEl = document.getElementById('results'); if (resultsEl) resultsEl.innerText = 'Load failed: unexpected /api/sheets response: ' + errText; return;
          }
        }catch(e){ const errText = typeof rows === 'object' ? JSON.stringify(rows) : String(rows); const resultsEl = document.getElementById('results'); if (resultsEl) resultsEl.innerText = 'Load failed: unexpected /api/sheets response: ' + errText; return; }
      }
      const qinputEl = document.getElementById('qinput');
      const qv = normalize(qinputEl ? qinputEl.value || '' : '');
  const checked = Array.from(document.querySelectorAll('#filter-country input[type=checkbox]:checked')).map(cb => decodeURIComponent(cb.dataset.val || cb.getAttribute('data-val') || ''));
  const checkedRepublics = Array.from(document.querySelectorAll('#filter-republic input[type=checkbox]:checked')).map(cb => decodeURIComponent(cb.dataset.val || cb.getAttribute('data-val') || ''));
      const checkedDecades = Array.from(document.querySelectorAll('#filter-decade input[type=checkbox]:checked')).map(cb => decodeURIComponent(cb.dataset.val || cb.getAttribute('data-val') || ''));
      const checkedTypes = Array.from(document.querySelectorAll('#filter-type input[type=checkbox]:checked')).map(cb => decodeURIComponent(cb.dataset.val || cb.getAttribute('data-val') || ''));
      window.lastFiltered = (rows || []).filter(r => {
        if (qv && !normalize(Object.values(r||{}).join(' ')).includes(qv)) return false;
        if (window.selectedComposer){ const comp = (r['Composer'] || r.Composer || '').toString(); if (!normalize(comp).includes(normalize(window.selectedComposer))) return false; }
        if (checked.length){ const countryVal = normalize(r.Country || r.Nationality || ''); const matches = checked.some(sel => normalize(sel) && countryVal.includes(normalize(sel))); if (!matches) return false; }
        if (checkedRepublics.length){ const repRaw = (function(){ try{
            // Prefer a case-insensitive, trimmed match for the explicit header 'Soviet republic'
            if (r && typeof r === 'object' && !Array.isArray(r)){
              const foundKey = Object.keys(r).find(k => normalize(k||'') === normalize('Soviet republic'));
              if (foundKey) return r[foundKey] != null ? String(r[foundKey]) : '';
            }
            // fallback to column-letter or other aliases
            return getByLetterFromRow(r, 'G') || r['Soviet republic'] || r['Soviet Republic'] || r['Republic'] || r['Republic/Region'] || '';
          }catch(_){ return ''; } })();
          const repVal = normalize(repRaw || '');
          const matchesR = checkedRepublics.some(sel => normalize(sel) && repVal.includes(normalize(sel)));
          if (!matchesR) return false; }
        if (checkedDecades.length){ const decadeVal = normalize(r.Decade || r.Year || ''); const matches = checkedDecades.some(sel => normalize(sel) && decadeVal.includes(normalize(sel))); if (!matches) return false; }
        if (checkedTypes.length){ const typeVal = normalize(r.Type || r.type || r['Type of piece'] || r['Type'] || ''); const matches = checkedTypes.some(sel => normalize(sel) && typeVal.includes(normalize(sel))); if (!matches) return false; }
        return true;
      });
      try{
        const bd = document.getElementById('cr-debug');
        if (bd) bd.textContent = `client: ${ (window.lastFiltered || []).length } results`;
      }catch(_){ }
      try{ updateDebugPanel({ apiRows: window.lastApiRowsCount || 0, filtered: (window.lastFiltered||[]).length, page: window.currentPage }); }catch(_){ }
      if (options && options.resetPage) window.currentPage = 1;
      renderPage(window.currentPage);
      try{
        const params = new URLSearchParams(window.location.search || '');
        if (params.get('random') === '1' && window.lastFiltered && window.lastFiltered.length){
          const start = (window.currentPage - 1) * window.PAGE_SIZE;
          const first = window.lastFiltered[start];
          if (first){
            const composerName = first['Composer'] || first.Composer || first['composer'] || Object.values(first)[0] || '';
            window.selectedComposer = String(composerName || '');
            populateComposerBox(window.selectedComposer, first);
          }
        }
      }catch(e){ }
    }catch(e){ const resultsEl = document.getElementById('results'); if (resultsEl) resultsEl.innerText = 'Load failed: ' + String(e); }
  }
  window.loadResults = loadResults;

  async function populateComposerBox(name, row){
    const content = document.getElementById('composer-content');
    const clearBtn = document.getElementById('clear-composer');
    if (!content) return;
    if (!name){ content.innerHTML = 'Select a result to view composer details.'; if (clearBtn) clearBtn.style.display = 'none'; return; }
    const normalizeKey = k => String(k || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').trim();
    const normVal = v => (typeof normalize === 'function') ? normalize(String(v || '')) : String(v || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').trim();
    const looksLikeCompDet = (sampleObj) => {
      if (!sampleObj || typeof sampleObj !== 'object') return false;
      const keys = Object.keys(sampleObj).map(k => normalizeKey(k));
      const hasComposer = keys.some(k => k.includes('composer') || k.includes('композитор'));
      const hasLife = keys.some(k => k.includes('lifespan') || k.includes('life') || k.includes('born') || k.includes('died') || k.includes('years'));
      const hasCountry = keys.some(k => k.includes('country') || k.includes('republic') || k.includes('nationality') || k.includes('soviet'));
      const looksLikeMusicList = keys.includes('title') || keys.includes('compositions') || keys.includes('snippet') || keys.includes('published');
      return hasComposer && (hasLife || hasCountry) && !looksLikeMusicList;
    };
    const candidates = ['CompDet','Sheet2','ComposersAggregated','Composers','Aggregated'];
    let rows = [];
    let sourceSheet = null;
    try {
      const mres = await fetch('/api/sheets?sheet=MusicList', { headers: { 'Accept': 'application/json' } });
      const mj = await mres.json().catch(()=>null);
      const mjRows = (mj && Array.isArray(mj)) ? mj : (mj && mj.rows && Array.isArray(mj.rows) ? mj.rows : null);
      if (mjRows && mjRows.length) { rows = mjRows; sourceSheet = 'MusicList'; console.debug('COMPOSER_DEBUG using MusicList aggregation (client-side)'); }
    } catch (e) { }
    for (const sname of candidates){
      try{
        const res = await fetch('/api/sheets?sheet=' + encodeURIComponent(sname), { headers: { 'Accept': 'application/json' } });
        const jrRaw = await res.json().catch(()=>null);
        const jr = Array.isArray(jrRaw) ? jrRaw : (jrRaw && Array.isArray(jrRaw.rows) ? jrRaw.rows : jrRaw);
        if (Array.isArray(jr) && jr.length){ const sample = jr[0]; if (looksLikeCompDet(sample)){ rows = jr; sourceSheet = sname; console.debug('COMPOSER_DEBUG selected sheet (api):', sname, 'headers:', Object.keys(sample)); break; } else { console.debug('COMPOSER_DEBUG rejected sheet (api):', sname, 'headers:', Object.keys(sample)); } }
        else { console.debug('COMPOSER_DEBUG no-array or empty from API for', sname, jr); }
      }catch(e){ console.debug('COMPOSER_DEBUG api fetch failed for', sname, e); }
    }
    if ((!rows || rows.length === 0)){
      for (const sname of candidates){
        try{
          const g = await gvizFetch(sname);
          if (g && g.rows && g.rows.length){
            const headers = g.cols.map(h => String(h).trim() || '');
            const sampleObj = {};
            for (let i=0;i<headers.length;i++){ const hk = headers[i] || `col${i+1}`; sampleObj[hk] = g.rows[0][i]; }
            if (looksLikeCompDet(sampleObj)){
              rows = g.rows.map(r => { const obj = {}; for (let i = 0; i < headers.length; i++) { const hk = headers[i] || `col${i+1}`; obj[hk] = r[i] !== undefined && r[i] !== null ? r[i] : ''; } return obj; });
              sourceSheet = sname; break;
            }
          }
        }catch(e){ console.debug('COMPOSER_DEBUG gviz fetch failed for', sname, e); }
      }
    }
    if (!rows || rows.length === 0){ content.innerHTML = `<div>No composer detail sheet (CompDet) could be located. I tried: ${candidates.join(', ')}.</div>`; if (clearBtn) clearBtn.style.display = 'none'; return; }
    let matchRow = null; let foundVal = null; const target = String(name || '').trim(); const normTarget = normVal(target);
    const sampleKeys = Object.keys(rows[0] || {});
    const composerKey = sampleKeys.find(k => normalizeKey(k).includes('composer') || normalizeKey(k).includes('композитор'));
    if (composerKey){ for (const r of rows){ const val = String(r[composerKey] || '').trim(); if (!val) continue; const nv = normVal(val); if (nv === normTarget || nv.includes(normTarget) || normTarget.includes(nv)){ matchRow = r; foundVal = val; break; } } }
    if (!matchRow){ for (const r of rows){ for (const v of Object.values(r)){ if (!v) continue; const str = String(v || '').trim(); const nv = normVal(str); if (nv === normTarget || nv.includes(normTarget) || normTarget.includes(nv)){ matchRow = r; foundVal = str; break; } } if (matchRow) break; } }
    if (!matchRow){ const samplePreview = escapeHtml(JSON.stringify(rows[0] || {}, null, 2)); content.innerHTML = `<div>No composer match in ${escapeHtml(sourceSheet || 'CompDet')} for <strong>${escapeHtml(name)}</strong>.</div><div style="margin-top:8px;color:#6b7280;font-size:0.9rem">Sample headers from detected sheet (for debugging):</div><pre style="max-height:220px;overflow:auto;background:#fafafa;border:1px solid #eee;padding:8px;border-radius:6px;font-size:0.85rem">${samplePreview}</pre>`; if (clearBtn) clearBtn.style.display = 'inline-block'; return; }
    let rowObj = {};
    if (Array.isArray(matchRow)){
      const sampleObj = (rows && rows.length && typeof rows[0] === 'object') ? rows[0] : null;
      if (sampleObj){ const sampleKeys = Object.keys(sampleObj); for (let i=0;i<matchRow.length;i++){ rowObj[sampleKeys[i] || `col${i+1}`] = matchRow[i]; } } else { for (let i=0;i<matchRow.length;i++) rowObj[`col${i+1}`] = matchRow[i]; }
    } else if (typeof matchRow === 'object' && matchRow){ rowObj = matchRow; }
    const desired = ['Composer','Lifespan','Country','Soviet republic','Nationality','Language','Notes','Learn more'];
    const normMap = {};
    Object.keys(rowObj || {}).forEach(k => { try { normMap[normalizeKey(k)] = rowObj[k]; } catch { normMap[String(k||'')] = rowObj[k]; } });
    const getValForLabels = (labels) => {
      for (const lab of labels){ const nk = normalizeKey(lab); if (nk && (nk in normMap) && normMap[nk] !== undefined && normMap[nk] !== null && String(normMap[nk]).trim() !== '') { return String(normMap[nk]); } }
      const allValues = Object.values(normMap||{}).map(v => v==null? '': String(v));
      const lifeHintRegex = /\b\d{3,4}\s*[–—-]\s*\d{2,4}\b|\b\d{3,4}\b/;
      for (const v of allValues){ if (v && lifeHintRegex.test(String(v))) return v; }
      for (const v of allValues){ if (v && String(v).trim() !== '') return v; }
      return '';
    };
    const headerAliases = {
      'Composer': ['Composer','Композитор','composer','Name','name'],
      'Lifespan': ['Lifespan','Life span','Born','Died','Years'],
      'Country': ['Country','country','Страна','Country of birth','Nationality'],
      'Soviet republic': ['Soviet republic','Republic','Soviet'],
      'Nationality': ['Nationality','Nationality (EN)'],
      'Language': ['Language','language','Язык'],
      'Notes': ['Notes','notes','Примечания'],
      'Learn more': ['Learn more','Link','URL']
    };
    const values = desired.map(h => { const aliases = headerAliases[h] || [h]; const v = getValForLabels(aliases); return v == null ? '' : String(v); });
    const lifespanIndex = desired.indexOf('Lifespan');
    const lifespanRaw = (lifespanIndex >= 0 ? (values[lifespanIndex] || '') : '') || '';
    const cleanDisplay = s => String(s || '').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
    const dispFound = cleanDisplay(foundVal);
    const dispLifespan = cleanDisplay(lifespanRaw);
    const sourceHtml = sourceSheet ? `<div style="margin-top:6px;color:#6b7280;font-size:0.85rem">Source: ${escapeHtml(sourceSheet)}</div>` : '';
    const preStyle = 'background:#fafafa;border:1px solid #eee;padding:8px;border-radius:6px;margin-top:8px;font-size:0.95rem;white-space:pre-wrap';
    const colEHtml = dispLifespan ? `<div style="margin-top:4px;color:#6b7280;font-style:italic;font-size:0.95rem">${escapeHtml(dispLifespan)}</div>` : '';
    content.innerHTML = `<div><strong style="color:var(--accent)">${escapeHtml(dispFound)}</strong>${colEHtml}${sourceHtml}<pre style="${preStyle}">${escapeHtml(desired.join('\t'))}\n${escapeHtml(values.join('\t'))}</pre></div>`;
    if (clearBtn) { clearBtn.style.display = 'inline-block'; clearBtn.onclick = () => { window.selectedComposer = ''; if (clearBtn) clearBtn.style.display = 'none'; populateComposerBox('', null); window.currentPage = 1; window.loadResults(); }; }
  }
  window.populateComposerBox = populateComposerBox;

  (async function init(){
    try{
      const resultsList = document.getElementById('results-list'); if (resultsList) resultsList.innerHTML = '<div class="result-item"><em>Loading results…</em></div>';
      const fc = document.getElementById('filter-country'); if (fc) fc.innerHTML = '<div style="color:#6b7280">Loading…</div>';
      const fd = document.getElementById('filter-decade'); if (fd) fd.innerHTML = '<div style="color:#6b7280">Loading…</div>';
      const ft = document.getElementById('filter-type'); if (ft) ft.innerHTML = '<div style="color:#6b7280">Loading…</div>';
      await Promise.allSettled([window.populateCountryCheckboxes(), window.populateDecadeCheckboxes(), window.populateTypeCheckboxes()]);
      const sbtn = document.getElementById('qbtn'); if (sbtn) sbtn.addEventListener('click', ()=>{ window.currentPage = 1; window.loadResults(); });
      const qinputEl = document.getElementById('qinput'); if (qinputEl) qinputEl.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') { window.currentPage = 1; window.loadResults(); } });
      try{ window.populateComposerBox('', null); }catch(_){ }
      await window.loadResults();
    }catch(e){ const resultsEl = document.getElementById('results'); if (resultsEl) resultsEl.innerText = 'Initialization failed: ' + String(e); console.error('Initialization failed', e); }
  })();

  // expose helpers
  window.gvizFetch = gvizFetch;
  window.normalize = normalize;
  window.escapeHtml = escapeHtml;

  // Allow static buttons in the template to ask the client to filter by composer
  window.filterByComposer = function(name){ try{ if (!name) return; window.selectedComposer = String(name || ''); window.currentPage = 1; if (typeof window.loadResults === 'function') window.loadResults(); }catch(e){ console.warn('filterByComposer failed', e); } };

  // basic wiring
  try{
    window.populateCountryCheckboxes().catch(()=>{});
    // ensure static republic checkboxes (in the Astro template) trigger filtering when toggled
    try{
      document.querySelectorAll('#filter-republic input[type=checkbox]').forEach(cb=> cb.addEventListener('change', ()=>{ window.currentPage = 1; window.loadResults(); }));
    }catch(e){ }
    const sbtn = document.getElementById('qbtn'); if (sbtn) sbtn.addEventListener('click', ()=>{ window.currentPage = 1; window.loadResults(); });
    const qinputEl = document.getElementById('qinput'); if (qinputEl) qinputEl.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') { window.currentPage = 1; window.loadResults(); } });
  }catch(e){ console.error('client init failed', e); }

})();