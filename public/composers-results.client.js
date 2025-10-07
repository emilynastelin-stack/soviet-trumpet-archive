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
    // no persistent debug badge in production
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
  function canonicalGender(s){
    const n = normalize(s || '');
    if (!n) return '';
    if (n === 'f' || n === 'female') return 'female';
    if (n === 'm' || n === 'male') return 'male';
    if (/\bfemale\b/.test(n)) return 'female';
    if (/\bmale\b/.test(n)) return 'male';
    return n;
  }
  function escapeHtml(str){ if (str == null) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  // production: no visible debug panel

  // Helper: get a value for spreadsheet column letter from an arbitrary row
  function getByLetterFromRow(row, letter){
    if (!row || !letter) return '';
    const up = String(letter).toUpperCase();
    const idx = up.charCodeAt(0) - 65; // A=0
    try{
      if (Array.isArray(row)){
        return row[idx] != null ? row[idx] : '';
      }
      // try common column names like colN
      const colName = 'col' + (idx + 1);
      if (row[colName] != null) return row[colName];
      // use nth key fallback
      const keys = Object.keys(row || {});
      if (keys[idx]) return row[keys[idx]] != null ? row[keys[idx]] : '';
      // try header-like property matching
      const letterName = Object.keys(row || {}).find(k => String(k || '').toUpperCase() === up);
      if (letterName) return row[letterName];
    }catch(_){ }
    return '';
  }

  function headerLabelForRow(row, letter){
    const up = String(letter).toUpperCase();
    const idx = up.charCodeAt(0) - 65;
    if (Array.isArray(row)) return 'Column ' + up;
    const keys = Object.keys(row || {});
    if (keys[idx]) return keys[idx];
    return 'Column ' + up;
  }

  async function gvizFetch(sheetName, range = 'A1:Z1000'){
    try{
      const id = '1UiK8QDq98C-9wCpQjdQAVpSdH8mZkpxYgMMEHM3uaGk';
      const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&range=${encodeURIComponent(range)}`;
      const txt = await (await fetch(url)).text();
      const m = txt.match(/google\.visualization\.Query\.setResponse\((.*)\);?/s);
      if (!m || !m[1]) return null;
      const json = JSON.parse(m[1]);
      if (!json || !json.table) return null;
      const cols = (json.table.cols || []).map(c => (c && (c.label || c.id)) ? String(c.label || c.id) : '');
      const rows = (json.table.rows || []).map(r => (r.c || []).map(cell => (cell && cell.v !== undefined && cell.v !== null) ? cell.v : ''));
      return { cols, rows };
    }catch(_){ return null; }
  }

  // Fetch top N works for a composer from MusicList (best-effort matching)
  async function fetchMoreWorks(composerName, limit = 5){
    if (!composerName) return [];
    try{
      const res = await fetch('/api/sheets?sheet=MusicList', { headers: { 'Accept': 'application/json' } });
      const raw = await res.json().catch(()=>null);
      const rows = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.rows) ? raw.rows : []);
      if (!rows || !rows.length) return [];
      const norm = s => String((s||'')).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
      const target = norm(composerName || '');
      const matches = [];
      for (const r of rows){
        const author = (r['Composer'] || r.Composer || r.composer || Object.values(r)[0] || '') || '';
        const an = norm(author);
        if (!an) continue;
        if (an === target || an.includes(target) || target.includes(an)){
          matches.push(r);
        }
        if (matches.length >= limit) break;
      }
      return matches;
    }catch(e){ return []; }
  }

  // Ensure a single pair of Select All / Clear controls exist inside a filter container
  function ensureControls(container, selectId, clearId){
    // Intentionally no-op: Select All / Clear All controls were removed from the UI.
    // The client will rely on individual checkbox interactions only.
    return;
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
  // wire up change handlers for checkboxes; no Select/Clear controls are created
  container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.addEventListener('change', (e)=>{ try{ const val = decodeURIComponent(cb.dataset.val || cb.getAttribute('data-val')||''); window.lastAppliedFilter = { kind: 'country', value: val }; }catch(_){} window.currentPage = 1; window.loadResults(); }));
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
    const hasDecadeHeading = container.closest && container.closest('.filter-group') && container.closest('.filter-group').querySelector('h4');
    const fallbackDecades = ['1920s','1930s','1940s','1950s','1960s','1970s','1980s'];
    try{
      const res = await fetch('/i18n/translations.json');
      const json = await res.json();
      const en = json && json.en ? json.en : null;
      const canonical = en && en.decades ? en.decades : fallbackDecades;
      const locale = (function(){ try{ return localStorage.getItem('locale') || 'en'; }catch(e){ return 'en'; } })();
      const localized = (json && json[locale] && json[locale].decades) ? json[locale].decades : canonical;
      container.innerHTML = '';
      if (!hasDecadeHeading) {
        const title = document.createElement('div'); title.className = 'list-title'; title.textContent = 'Decade'; container.appendChild(title);
      }
      for (let i=0;i<canonical.length;i++){
        const val = canonical[i];
        const lab = (localized && localized[i]) ? localized[i] : val;
        const id = 'decade_cb_' + i;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `<label style="display:block;margin-bottom:6px;"><input type="checkbox" data-val="${encodeURIComponent(val)}" id="${id}" /> ${lab}</label>`;
        container.appendChild(wrapper);
      }
  // wire up change handlers for checkboxes; no Select/Clear controls are created
  container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.addEventListener('change', ()=>{ window.currentPage = 1; window.loadResults(); }));
    }catch(e){
      container.innerHTML = '';
      if (!hasDecadeHeading) {
        const title = document.createElement('div'); title.className = 'list-title'; title.textContent = 'Decade'; container.appendChild(title);
      }
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
        const hasTypeHeading = container.closest && container.closest('.filter-group') && container.closest('.filter-group').querySelector('h4');
        const locale = (function(){ try{ return localStorage.getItem('locale') || 'en'; }catch(e){ return 'en'; } })();
        const localized = (jsonT && jsonT[locale] && jsonT[locale].types) ? jsonT[locale].types : canonicalTypes;
        container.innerHTML = '';
        if (!hasTypeHeading) {
          const title = document.createElement('div'); title.className = 'list-title'; title.textContent = 'Type of piece'; container.appendChild(title);
        }
        canonicalTypes.forEach((val,i)=>{
          const lab = localized && localized[i] ? localized[i] : val;
          const id = 'type_cb_' + i;
          const wrapper = document.createElement('div');
          wrapper.innerHTML = `<label style="display:block;margin-bottom:6px;"><input type="checkbox" data-val="${encodeURIComponent(val)}" id="${id}" /> ${lab}</label>`;
          container.appendChild(wrapper);
        });
  // wire up change handlers for checkboxes; no Select/Clear controls are created
  container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.addEventListener('change', (e)=>{ try{ const val = decodeURIComponent(cb.dataset.val || cb.getAttribute('data-val')||''); window.lastAppliedFilter = { kind: 'type', value: val }; }catch(_){} window.currentPage = 1; window.loadResults(); }));
        return;
      }
      const res = await fetch('/api/sheets', { headers: { 'Accept': 'application/json' } });
      const raw = await res.json().catch(()=>null);
      const rows = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.rows) ? raw.rows : raw);
      const set = new Set();
      (rows || []).forEach(r => { const t = r.Type || r.type || r['Type of piece'] || r['Type'] || ''; if (t) set.add(String(t).trim()); });
      const list = Array.from(set).sort();
      container.innerHTML = '';
      const hasTypeHeading = container.closest && container.closest('.filter-group') && container.closest('.filter-group').querySelector('h4');
      if (!hasTypeHeading) {
        const titleDyn = document.createElement('div'); titleDyn.className = 'list-title'; titleDyn.textContent = 'Type of piece'; container.appendChild(titleDyn);
      }
  // No select/clear controls for Type group — only populate checkboxes
      list.forEach((val,i)=>{
        const id = 'type_cb_dyn_' + i;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `<label style="display:block;margin-bottom:6px;"><input type="checkbox" data-val="${encodeURIComponent(val)}" id="${id}" /> ${val}</label>`;
        container.appendChild(wrapper);
      });
    container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.addEventListener('change', ()=>{ window.currentPage = 1; window.loadResults(); }));
    }catch(e){ container.innerHTML = ''; }
  }
  window.populateTypeCheckboxes = populateTypeCheckboxes;

  window.populateGenderCheckboxes = async function(){
    const container = document.getElementById('filter-gender');
    if (!container) return;
    try{
      // Try to fetch distinct gender values from the API (MusicList)
      const res = await fetch('/api/sheets', { headers: { 'Accept': 'application/json' } });
      const raw = await res.json().catch(()=>null);
      const rows = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.rows) ? raw.rows : raw);
      const set = new Set();
      // Column H is index 7 (A=0). If API returns array rows, read index 7. Otherwise look for object keys.
      (rows || []).forEach((r, idx) => {
        let vals = [];
        if (Array.isArray(r)){
          // skip header row if it looks like a header
          const candidate = r[7];
          if (idx === 0 && typeof candidate === 'string' && /gender/i.test(candidate)) return;
          if (candidate != null) vals.push(candidate);
        } else if (r && typeof r === 'object'){
          const candidate = r.Gender || r.gender || r['Gender'] || r['gender'] || r['Column H'] || r['H'] || r['Col H'] || null;
          if (candidate != null) vals.push(candidate);
        }
        // split multi-valued cells like "Male, Female" or "Male / Female"
        vals.forEach(v => {
          if (v == null) return;
          const parts = String(v).split(/[;,\/|]+/).map(s => s.trim()).filter(Boolean);
          parts.forEach(p => set.add(p));
        });
      });
      let list = Array.from(set).map(s => String(s).trim()).filter(Boolean).sort();
      if (!list.length) list = ['Male','Female','Other'];
      container.innerHTML = '';
      list.forEach((val,i)=>{
        const id = 'gender_cb_dyn_' + i;
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" data-val="${encodeURIComponent(val)}" id="${id}" value="${escapeHtml(val)}"> ${escapeHtml(val)}`;
        container.appendChild(label);
      });
      // ensure controls at bottom of gender area
      ensureControls(container, 'gender-select-all', 'gender-clear');
      // wire handlers
      container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.addEventListener('change', ()=>{ window.currentPage = 1; window.loadResults(); }));
      const selAll = document.getElementById('gender-select-all');
      const clr = document.getElementById('gender-clear');
      if (selAll) selAll.addEventListener('click', (e)=>{ e.preventDefault(); container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked = true); window.currentPage = 1; window.loadResults(); });
      if (clr) clr.addEventListener('click', (e)=>{ e.preventDefault(); container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked = false); window.currentPage = 1; window.loadResults(); });
    }catch(e){
      // On any failure, fall back to wiring existing static inputs if present
      try{
        container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.addEventListener('change', ()=>{ window.currentPage = 1; window.loadResults(); }));
        const selAll = document.getElementById('gender-select-all');
        const clr = document.getElementById('gender-clear');
        if (selAll) selAll.addEventListener('click', (ev)=>{ ev.preventDefault(); container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked = true); window.currentPage = 1; window.loadResults(); });
        if (clr) clr.addEventListener('click', (ev)=>{ ev.preventDefault(); container.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked = false); window.currentPage = 1; window.loadResults(); });
      }catch(_){ }
    }
  };

  /* ---------------------------------------------------------------------------
    CENTER PANEL RENDERER: renderPage
    -----------------------------------------------------------
    This function controls the rendering of the center results panel. It
    receives the page number and reads `window.lastFiltered` to build the
    DOM nodes that appear inside `#results-list`. If you want to change the
    structure of individual result cards, modify the markup produced here.
    The function creates nodes that match the server-side CSS selectors
    (.result-card, .result-main, .result-right, .details-link,
    .more-composer-btn) so style rules in the page apply consistently.
  --------------------------------------------------------------------------- */
  function renderPage(page){
    const container = document.getElementById('results-list');
    if (!container) return;
    container.innerHTML = '';
    const start = (page - 1) * window.PAGE_SIZE;
    const pageItems = (window.lastFiltered || []).slice(start, start + window.PAGE_SIZE);
  if (!pageItems.length) { container.innerHTML = '<div class="result-card">No results</div>'; return; }
  pageItems.forEach((r, idx) =>{
      const globalIndex = start + idx;
      const div = document.createElement('div');
      div.className = 'result-card';
      const title = (r.Title || r.Compositions || r.title || 'Untitled');
      const author = r['Composer'] || r.Composer || r.composer || 'Unknown';
      const published = r.Year || r.Published || r.Decade || r.year || '';
      const pieceType = r['Type'] || r.Type || r['Type of piece'] || '';
      const composerEsc = escapeHtml(author);
      const composerData = encodeURIComponent(String(author || ''));
      div.innerHTML = `
        <div class="result-main">
          <b>${escapeHtml(title)}</b>
          <div class="meta">${escapeHtml(pieceType || '')}${(pieceType && published) ? ' · ' : ''}${escapeHtml(published || '')}</div>
          <div style="margin-top:8px"><strong>Composer:</strong> <a href="#" class="composer-link" data-index="${globalIndex}" data-name="${composerData}">${composerEsc}</a></div>
        </div>
        <div class="result-right">
          <a href="#" class="details-link" data-index="${globalIndex}">Details</a>
          <button class="more-composer-btn" data-index="${globalIndex}" data-name="${composerData}">More from this composer</button>
        </div>
      `;
      container.appendChild(div);
      // prefer CSS for layout; ensure a consistent border-bottom for list separation
      try{ div.style.borderBottom = '1px solid #eef2f6'; }catch(_){ }
    });

  // ------------------------------------------------------------------
  // Wiring: composer links, Details link and "More from this composer" btn
  // ------------------------------------------------------------------
  // The handlers below control interactive behavior for items in the
  // center panel. populateComposerBox is used to fill the right-hand
  // composer panel; renderInlineDetails will render additional per-item
  // detail blocks if invoked.
  // wire up composer link and details link click handlers (delegated from current container)
    Array.from(container.querySelectorAll('.composer-link')).forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const name = decodeURIComponent(link.dataset.name || '');
        window.selectedComposer = name || '';
        // find the corresponding row by index if available or pass name
        const idx = Number(link.dataset.index);
        const row = Array.isArray(window.lastFiltered) ? window.lastFiltered[idx] : null;
  populateComposerBox(name, row || {});
        // filter results to this composer
        try{ window.currentPage = 1; window.loadResults(); }catch(_){ }
      });
    });
    Array.from(container.querySelectorAll('.details-link')).forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const idx = Number(link.dataset.index);
        const row = Array.isArray(window.lastFiltered) ? window.lastFiltered[idx] : null;
        const name = row && (row['Composer'] || row.Composer || row.composer) ? (row['Composer'] || row.Composer || row.composer) : '';
  // toggle inline details beneath this result (columns L..R)
  // NOTE: result cards use the .result-card class
  const resultItem = link.closest('.result-card');
        if (!resultItem) { populateComposerBox(name, row || {}); return; }
        const existing = resultItem.nextElementSibling;
        if (existing && existing.classList && existing.classList.contains('inline-details') && existing.dataset.forIndex == String(idx)){
          // already open -> close
          existing.remove();
          return;
        }
        // remove any other inline details blocks
        Array.from(document.querySelectorAll('.inline-details')).forEach(n => n.remove());
  const detailsEl = renderInlineDetails(row || {}, idx);
        if (detailsEl) resultItem.parentNode.insertBefore(detailsEl, resultItem.nextSibling);
        // Note: do NOT call loadResults here — keeping details open requires avoiding a full re-render
      });
    });
    Array.from(container.querySelectorAll('.more-composer-btn')).forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const name = decodeURIComponent(btn.dataset.name || '');
        const idx = Number(btn.dataset.index);
        const row = Array.isArray(window.lastFiltered) ? window.lastFiltered[idx] : null;
        window.selectedComposer = name || '';
        populateComposerBox(name, row || {});
      });
    });

    // remove bottom border on last item (target .result-card)
    try{
      const items = Array.from(container.children).filter(n => n.classList && n.classList.contains('result-card'));
      if (items.length){ items[items.length-1].style.borderBottom = 'none'; }
    }catch(_){ }

    renderPagination(Math.ceil((window.lastFiltered || []).length / window.PAGE_SIZE), page);
  }


  /* ---------------------------------------------------------------------------
     Composer panel rendering helpers
     -----------------------------------------------------------
     Below are the functions that populate the composer details panel and
     render inline details for a specific result. If you'd like the right
     panel to show different fields or richer HTML (e.g., images, links,
     downloads), update populateComposerBox and renderInlineDetails.
  --------------------------------------------------------------------------- */

    // Render an inline details block showing columns L..R beneath a result item
    function renderInlineDetails(row, index){
      const letters = ['L','M','N','O','P','Q','R'];
      const wrapper = document.createElement('div');
      wrapper.className = 'inline-details';
      wrapper.dataset.forIndex = String(index);
      wrapper.style.padding = '12px 16px';
      wrapper.style.background = '#fbfbfd';
      wrapper.style.borderLeft = '4px solid rgba(0,0,0,0.03)';
      wrapper.style.marginBottom = '8px';
      wrapper.style.borderBottom = '1px solid #e6e9ef';
      const rows = letters.map(l => {
        const label = headerLabelForRow(row, l) || l;
        const val = getByLetterFromRow(row, l) || '';
        return `<div style="margin-bottom:6px;"><strong style="display:block;color:#374151">${escapeHtml(String(label))}</strong><div style="color:#0f172a">${escapeHtml(String(val))}</div></div>`;
      }).join('\n');
      wrapper.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px">${rows}</div>`;
      return wrapper;
    }

  function renderPagination(pageCount, active){
    // render pagination into both top and bottom roots
    let pag = document.getElementById('pagination');
    if (pag) pag.remove();
    const topRoot = document.getElementById('results-pagination-top');
    const bottomRoot = document.getElementById('results-pagination-bottom');
    // the results container may be `results-list` in the page markup; accept either
    const resultsEl = document.getElementById('results') || document.getElementById('results-list');
    if (!resultsEl || (!topRoot && !bottomRoot)) return;

    function buildWrapper(){
      const wrapper = document.createElement('div');
      wrapper.id = 'pagination';
      wrapper.className = 'pagination';
      return wrapper;
    }
    function clearAllFilters(){
      try{
        const qinput = document.getElementById('qinput'); if (qinput) qinput.value = '';
        window.selectedComposer = '';
        window.lastAppliedFilter = null;
        const clearComposerBtn = document.getElementById('clear-composer'); if (clearComposerBtn) clearComposerBtn.style.display = 'none';
        const composerContent = document.getElementById('composer-content'); if (composerContent) composerContent.innerHTML = 'Select a result to view composer details.';
        document.querySelectorAll('#filter-country input[type=checkbox], #filter-decade input[type=checkbox], #filter-type input[type=checkbox]').forEach(cb=> cb.checked = false);
        window.currentPage = 1;
        window.loadResults();
      }catch(e){ console.error('clearAllFilters failed', e); }
    }
    // helper to build the controls (creates fresh elements so event listeners work on both roots)
    function buildControls(){
      const rootWrap = document.createElement('div');
      rootWrap.style.display='flex';
      rootWrap.style.alignItems='center';
      rootWrap.style.gap='8px';
      rootWrap.style.justifyContent='flex-end';

      // Build active-filter pills (composer, search, country, decade, type, gender)
      const pillsWrap = document.createElement('div');
      pillsWrap.style.display = 'flex';
      pillsWrap.style.flexWrap = 'wrap';
      pillsWrap.style.gap = '8px';
      pillsWrap.style.alignItems = 'center';
      pillsWrap.style.marginRight = '8px';

      const makePill = (label, onClear) => {
        const pill = document.createElement('div');
        pill.style.display = 'inline-flex';
        pill.style.alignItems = 'center';
        pill.style.gap = '8px';
        pill.style.padding = '6px 10px';
        pill.style.border = '1px solid #e6e9ef';
        pill.style.borderRadius = '999px';
        pill.style.background = '#fff';
        pill.style.color = '#0f172a';
        const txt = document.createElement('span'); txt.textContent = label; txt.style.fontWeight = '600'; txt.style.maxWidth = '240px'; txt.style.overflow = 'hidden'; txt.style.textOverflow = 'ellipsis'; txt.style.whiteSpace = 'nowrap';
        const clr = document.createElement('button'); clr.textContent = 'Clear'; clr.style.marginLeft = '8px'; clr.style.padding = '4px 8px'; clr.style.border = '1px solid #d1d5db'; clr.style.borderRadius = '6px'; clr.style.background='#fff';
        clr.addEventListener('click', (e)=>{ e.preventDefault(); try{ onClear(); window.currentPage = 1; window.loadResults(); }catch(_){ } });
        pill.appendChild(txt); pill.appendChild(clr);
        return pill;
      };

      // Composer
      if (window.selectedComposer){
        pillsWrap.appendChild(makePill(window.selectedComposer, ()=>{ window.selectedComposer = ''; const cb = document.getElementById('clear-composer'); if (cb) cb.style.display='none'; }));
      }
      // Search query
      try{
        const qel = document.getElementById('qinput');
        const qv = qel && qel.value ? String(qel.value).trim() : '';
        if (qv) pillsWrap.appendChild(makePill('Search: "' + qv + '"', ()=>{ if (qel) qel.value = ''; }));
      }catch(_){ }
      // Selected checkboxes: country, decade, type, gender
      const addCheckedPills = (selector, labelPrefix='') => {
        try{
          Array.from(document.querySelectorAll(selector + ' input[type=checkbox]:checked')).forEach(cb => {
            const val = decodeURIComponent(cb.dataset.val || cb.getAttribute('data-val') || cb.value || '');
            if (val) pillsWrap.appendChild(makePill((labelPrefix ? labelPrefix + ': ' : '') + val, ()=>{ cb.checked = false; }));
          });
        }catch(_){ }
      };
      addCheckedPills('#filter-country');
      addCheckedPills('#filter-decade');
      addCheckedPills('#filter-type');
      addCheckedPills('#filter-gender');

      if (pillsWrap.children && pillsWrap.children.length) rootWrap.appendChild(pillsWrap);

      if (pageCount === 1){
        const placeholder = document.createElement('div'); placeholder.style.color='#6b7280'; placeholder.style.paddingRight='6px'; placeholder.textContent='1 of 1';
        const clearBtn = document.createElement('button'); clearBtn.textContent='Clear all filters'; clearBtn.style.padding='6px 10px'; clearBtn.style.borderRadius='6px'; clearBtn.style.border='1px solid #d1d5db'; clearBtn.style.background='#fff'; clearBtn.addEventListener('click', clearAllFilters);
        rootWrap.appendChild(placeholder); rootWrap.appendChild(clearBtn);
        const liveToggle = document.createElement('button'); liveToggle.textContent= window.liveTimer ? 'Live: On' : 'Live: Off'; liveToggle.style.marginLeft='8px'; liveToggle.style.padding='6px 10px'; liveToggle.style.borderRadius='6px'; liveToggle.addEventListener('click', ()=>{ if (window.liveTimer){ stopLiveUpdates(); liveToggle.textContent='Live: Off'; } else { startLiveUpdates(); liveToggle.textContent='Live: On'; }});
        rootWrap.appendChild(liveToggle);
        return rootWrap;
      }

      const prev = document.createElement('button'); prev.textContent='Prev'; prev.disabled = active === 1; prev.className = 'page-btn'; prev.setAttribute('aria-label','Previous page'); prev.addEventListener('click', ()=>{ if (window.currentPage>1){ window.currentPage--; renderPage(window.currentPage); window.scrollTo({top:0,behavior:'smooth'}); }});
      rootWrap.appendChild(prev);

      const maxButtons = 7; const half = Math.floor(maxButtons/2); let start = Math.max(1, active - half); let end = Math.min(pageCount, start + maxButtons -1); if (end - start < maxButtons -1) start = Math.max(1, end - maxButtons +1);
      for (let i=start;i<=end;i++){
        const b = document.createElement('button'); b.textContent = String(i); b.className = 'page-btn'; if (i===active){ b.setAttribute('aria-current','true'); } else { b.removeAttribute('aria-current'); }
        b.addEventListener('click', ()=>{ window.currentPage = i; renderPage(window.currentPage); window.scrollTo({top:0,behavior:'smooth'}); });
        rootWrap.appendChild(b);
      }

      const next = document.createElement('button'); next.textContent = 'Next'; next.disabled = active >= pageCount; next.className = 'page-btn'; next.setAttribute('aria-label','Next page'); next.addEventListener('click', ()=>{ if (window.currentPage<pageCount){ window.currentPage++; renderPage(window.currentPage); window.scrollTo({top:0,behavior:'smooth'}); }});
      rootWrap.appendChild(next);

      const clearBtn2 = document.createElement('button'); clearBtn2.textContent='Clear all filters'; clearBtn2.style.padding='6px 10px'; clearBtn2.style.borderRadius='6px'; clearBtn2.style.border='1px solid #d1d5db'; clearBtn2.style.background='#fff'; clearBtn2.addEventListener('click', clearAllFilters);
      const liveToggle2 = document.createElement('button'); liveToggle2.textContent = window.liveTimer ? 'Live: On' : 'Live: Off'; liveToggle2.style.marginRight='8px'; liveToggle2.style.padding='6px 10px'; liveToggle2.style.borderRadius='6px'; liveToggle2.addEventListener('click', ()=>{ if (window.liveTimer) { stopLiveUpdates(); liveToggle2.textContent='Live: Off'; } else { startLiveUpdates(); liveToggle2.textContent='Live: On'; } });
      // order: clear + live + pager
      const leftControls = document.createElement('div'); leftControls.style.display='flex'; leftControls.style.alignItems='center'; leftControls.style.gap='8px';
      leftControls.appendChild(clearBtn2); leftControls.appendChild(liveToggle2);
      // We'll place leftControls before the pager buttons visually by prepending
      rootWrap.insertBefore(leftControls, rootWrap.firstChild);

      return rootWrap;
    }

    // attach to top and bottom roots (fresh elements for each)
    if (topRoot){ topRoot.innerHTML = ''; topRoot.appendChild(buildControls()); }
    if (bottomRoot){ bottomRoot.innerHTML = ''; bottomRoot.appendChild(buildControls()); }
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
        // expose raw rows for debug and compute a small preview of the "Soviet republic"/column G values
        try{
          window.lastRowsJson = rows;
          window.lastApiRowsCount = Array.isArray(rows) ? rows.length : 0;
          const previewVals = [];
          for (let i=0;i<Math.min(20, window.lastApiRowsCount); i++){
            const r = rows[i];
            let rep = '';
            try{ rep = String(getByLetterFromRow(r, 'G') || r['Soviet republic'] || r['Soviet Republic'] || r['Republic'] || r['republic'] || r['Republic/Region'] || ''); }catch(_){ rep = ''; }
            rep = rep.replace(/\s+/g,' ').trim();
            previewVals.push(rep);
          }
          const uniq = Array.from(new Set(previewVals.filter(Boolean)));
          updateDebugPanel({ apiRows: window.lastApiRowsCount, note: 'republics: ' + (uniq.slice(0,10).join(' | ') || '(none)'), page: window.currentPage });
        }catch(e){ try{ updateDebugPanel({ error: 'debug preview failed: ' + String(e) }); }catch(_){} }
      const qinputEl = document.getElementById('qinput');
      const qv = normalize(qinputEl ? qinputEl.value || '' : '');
      const checked = Array.from(document.querySelectorAll('#filter-country input[type=checkbox]:checked')).map(cb => decodeURIComponent(cb.dataset.val || cb.getAttribute('data-val') || ''));
      const checkedDecades = Array.from(document.querySelectorAll('#filter-decade input[type=checkbox]:checked')).map(cb => decodeURIComponent(cb.dataset.val || cb.getAttribute('data-val') || ''));
  const checkedTypes = Array.from(document.querySelectorAll('#filter-type input[type=checkbox]:checked')).map(cb => decodeURIComponent(cb.dataset.val || cb.getAttribute('data-val') || ''));
  const checkedGenders = Array.from(document.querySelectorAll('#filter-gender input[type=checkbox]:checked')).map(cb => decodeURIComponent(cb.dataset.val || cb.getAttribute('data-val') || ''));
      const checkedRepublics = Array.from(document.querySelectorAll('#filter-republic input[type=checkbox]:checked')).map(cb => decodeURIComponent(cb.dataset.val || cb.getAttribute('data-val') || ''));
  // selected genders will be reflected in the UI status
      window.lastFiltered = (rows || []).filter(r => {
        if (qv && !normalize(Object.values(r||{}).join(' ')).includes(qv)) return false;
        if (window.selectedComposer){ const comp = (r['Composer'] || r.Composer || '').toString(); if (!normalize(comp).includes(normalize(window.selectedComposer))) return false; }
        if (checked.length){ const countryVal = normalize(r.Country || r.Nationality || ''); const matches = checked.some(sel => normalize(sel) && countryVal.includes(normalize(sel))); if (!matches) return false; }
        if (checkedDecades.length){ const decadeVal = normalize(r.Decade || r.Year || ''); const matches = checkedDecades.some(sel => normalize(sel) && decadeVal.includes(normalize(sel))); if (!matches) return false; }
        if (checkedRepublics.length){
          // Use helper to read column G (handles arrays and objects, and falls back to nth-key)
          let repVal = '';
          try{ repVal = String(getByLetterFromRow(r, 'G') || ''); }catch(_){ repVal = ''; }
          const matches = checkedRepublics.some(sel => normalize(sel) && normalize(repVal).includes(normalize(sel)));
          if (!matches) return false;
        }
        if (checkedTypes.length){ const typeVal = normalize(r.Type || r.type || r['Type of piece'] || r['Type'] || ''); const matches = checkedTypes.some(sel => normalize(sel) && typeVal.includes(normalize(sel))); if (!matches) return false; }
        if (checkedGenders.length){
          // extract gender value: handle array-form rows (column H -> index 7) or object keys
          let rawG = '';
          try{
            if (Array.isArray(r)){
              rawG = r[7] != null ? String(r[7]) : '';
            } else if (r && typeof r === 'object'){
              rawG = (r.Gender || r.gender || r['Gender'] || r['gender'] || r['Column H'] || r['H'] || r['col_8'] || '');
            }
          }catch(_){ rawG = '' }
          const parts = String(rawG || '').split(/[;,\/|]+/).map(s=> canonicalGender(s)).filter(Boolean);
          const checkedNorm = checkedGenders.map(canonicalGender).filter(Boolean);
          const matchesG = parts.some(p => checkedNorm.includes(p));
          if (!matchesG) return false;
        }
        return true;
      });
      try{
        const bd = document.getElementById('cr-debug');
        if (bd) bd.textContent = `client: ${ (window.lastFiltered || []).length } results`;
      }catch(_){ }
        try{ updateDebugPanel({ apiRows: window.lastApiRowsCount || 0, filtered: (window.lastFiltered || []).length, page: window.currentPage }); }catch(_){}
      if (options && options.resetPage) window.currentPage = 1;
      renderPage(window.currentPage);
      // gender-status removed; no visual indicator updated here
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

  /* ---------------------------------------------------------------------------
    RIGHT PANEL: populateComposerBox
    -----------------------------------------------------------
    This function populates the right-hand composer information panel
    (`#composer-content`) when a user clicks a composer link or the
    "More from this composer" button. It performs best-effort sheet
    selection, lookups and renders a detailed view. If you want to change
    the content, formatting, or which fields are shown for a composer,
    update this function.
  --------------------------------------------------------------------------- */
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
  const colEHtml = dispLifespan ? `<div style="margin-top:4px;color:#6b7280;font-style:italic;font-size:0.95rem">${escapeHtml(dispLifespan)}</div>` : '';
  // Helper: get value for a spreadsheet column letter (A..Z) from rowObj using header order if available
  function getByLetter(letter){
    if (!letter) return '';
    const up = String(letter).toUpperCase();
    const idx = up.charCodeAt(0) - 65; // A=0
    // if we have sampleKeys (header order) use it
    if (Array.isArray(sampleKeys) && sampleKeys[idx]){
      return rowObj[sampleKeys[idx]] != null ? rowObj[sampleKeys[idx]] : '';
    }
    // fallback to colN naming used earlier
    const colName = 'col' + (idx + 1);
    if (rowObj[colName] != null) return rowObj[colName];
    // fallback to nth key in object
    const keys = Object.keys(rowObj || {});
    if (keys[idx]) return rowObj[keys[idx]];
    return '';
  }
  function headerLabelFor(letter){ const up = String(letter).toUpperCase(); const idx = up.charCodeAt(0) - 65; if (Array.isArray(sampleKeys) && sampleKeys[idx]) return sampleKeys[idx]; return 'Column ' + up; }

  // Build the requested custom block (placed before the lifespan / italic text)
  const cC = getByLetter('C');
  // Use the actual value in column D as the header label, per request
  const dLabel = String(getByLetter('D') || '').trim() || headerLabelFor('D');
  const eVal = getByLetter('E');
  const fVal = getByLetter('F');
  const gVal = getByLetter('G');
  const hVal = getByLetter('H');
  const iVal = getByLetter('I');

  const customBlock = `
    <div style="margin-top:8px">
      <p lang="ru" style="margin:0 0 6px 0; font-family: 'Segoe UI', 'Noto Sans', Arial, sans-serif;"><strong>Russian:</strong> ${escapeHtml(cC || '')}</p>
      <p style="margin:0 0 6px 0"><strong>${escapeHtml(dLabel)}:</strong> ${escapeHtml(eVal || '')}</p>
      <div style="height:8px"></div>
      <p style="margin:0 0 6px 0"><strong>Country:</strong> ${escapeHtml(fVal || '')}</p>
      <p style="margin:0 0 6px 0"><strong>Soviet Republic:</strong> ${escapeHtml(gVal || '')}</p>
      <div style="height:8px"></div>
      <p style="margin:0 0 6px 0"><strong>Gender:</strong> ${escapeHtml(hVal || '')}</p>
      <p style="margin:0 0 6px 0"><strong>Notes:</strong> ${escapeHtml(iVal || '')}</p>
    </div>
  `;

  // Ensure composer content is top-aligned and can render Cyrillic fonts
  try{ content.style.textAlign = 'left'; content.style.fontFamily = "'Segoe UI', 'Noto Sans', Arial, sans-serif"; content.style.whiteSpace = 'normal'; }catch(_){ }
  // Only render the composer heading, the lifespan (italic gray) and then the requested custom block.
  content.innerHTML = `<div style="padding-top:0;margin-top:0"><strong style="color:var(--accent)">${escapeHtml(dispFound)}</strong>${colEHtml}${customBlock}</div>`;
  // Populate the dedicated "More from this composer" area so it won't be overwritten when composer-content is replaced
  try{
    const moreEl = document.getElementById('more-from-composer');
    if (moreEl){
      moreEl.style.display = 'block';
      moreEl.innerHTML = `<div style="background:#fff;padding:10px;border-radius:8px;border:1px solid #eef2f6;"><strong>More from ${escapeHtml(dispFound)}</strong><div id="more-works-list" style="margin-top:8px;color:#6b7280;font-size:0.95rem">Loading more works…</div></div>`;
      // populate with actual works
      try{
        const works = await fetchMoreWorks(dispFound, 5);
        const listWrap = moreEl.querySelector('#more-works-list');
        if (listWrap){
          if (!works || !works.length){ listWrap.innerHTML = '<div style="color:#6b7280">No additional works found.</div>'; }
          else{
            listWrap.innerHTML = '';
            works.forEach(w=>{
              const t = w.Title || w.title || w.Compositions || '';
              const yr = w.Published || w.Year || w['Date'] || '';
              const item = document.createElement('div'); item.style.padding = '8px 0'; item.style.borderBottom = '1px solid #f3f4f6';
              item.innerHTML = `<div style="font-weight:600;color:#111">${escapeHtml(t || '(untitled)')}</div><div style="font-size:0.9rem;color:#6b7280">${escapeHtml(yr || '')}</div>`;
              listWrap.appendChild(item);
            });
          }
        }
      }catch(_){ try{ const lw = moreEl.querySelector('#more-works-list'); if (lw) lw.innerHTML = '<div style="color:#6b7280">Failed to load works.</div>'; }catch(_){ } }
    }
  }catch(_){ }
    if (clearBtn) { clearBtn.style.display = 'inline-block'; clearBtn.onclick = () => { window.selectedComposer = ''; if (clearBtn) clearBtn.style.display = 'none'; try{ const moreEl = document.getElementById('more-from-composer'); if (moreEl) { moreEl.style.display = 'none'; moreEl.innerHTML = ''; } }catch(_){ } populateComposerBox('', null); window.currentPage = 1; window.loadResults(); }; }
  }
  window.populateComposerBox = populateComposerBox;

  (async function init(){
    try{
      const resultsList = document.getElementById('results-list'); if (resultsList) resultsList.innerHTML = '<div class="result-card"><em>Loading results…</em></div>';
  const fc = document.getElementById('filter-country'); if (fc) fc.innerHTML = '<div style="color:#6b7280">Loading…</div>';
  const fd = document.getElementById('filter-decade'); if (fd) fd.innerHTML = '<div style="color:#6b7280">Loading…</div>';
  const ft = document.getElementById('filter-type'); if (ft) ft.innerHTML = '<div style="color:#6b7280">Loading…</div>';
  const fg = document.getElementById('filter-gender'); if (fg) fg.innerHTML = '<div style="color:#6b7280">Loading…</div>';
  await Promise.allSettled([window.populateCountryCheckboxes(), window.populateDecadeCheckboxes(), window.populateTypeCheckboxes(), window.populateGenderCheckboxes()]);
      const sbtn = document.getElementById('qbtn'); if (sbtn) sbtn.addEventListener('click', ()=>{ window.currentPage = 1; window.loadResults(); });
      const qinputEl = document.getElementById('qinput'); if (qinputEl) qinputEl.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') { window.currentPage = 1; window.loadResults(); } });
      try{ window.populateComposerBox('', null); }catch(_){ }
      await window.loadResults();
      // mobile footer toolbar wiring
      try{
        const mfFilters = document.getElementById('mf-filters');
        const mfCenter = document.getElementById('mf-center');
        const mfComposers = document.getElementById('mf-composers');
        if (mfFilters) mfFilters.addEventListener('click', ()=>{ const el = document.getElementById('panel-left'); if (el) el.scrollIntoView({behavior:'smooth', block:'center'}); });
          if (mfCenter) mfCenter.addEventListener('click', ()=>{ const el = document.getElementById('panel-center'); if (el) el.scrollIntoView({behavior:'smooth', block:'center'}); });
          if (mfComposers) mfComposers.addEventListener('click', ()=>{ window.location.href = '/composers'; });
          // Mobile overlay behavior (clone-based): on small screens, open panels as overlays
          try{
            const overlays = new Map(); // which -> { overlay, trigger, clone }

            const focusableSelector = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

            const buildOverlay = (which, ariaLabel) => {
              const overlayId = 'mobile-overlay-' + which;
              let overlay = document.getElementById(overlayId);
              if (overlay) return overlay;
              overlay = document.createElement('div'); overlay.id = overlayId; overlay.className = 'mobile-overlay'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-label', ariaLabel || (which + ' panel'));
              const inner = document.createElement('div'); inner.className = 'overlay-inner';
              const closeBtn = document.createElement('button'); closeBtn.className = 'overlay-close'; closeBtn.type = 'button'; closeBtn.textContent = 'Close'; closeBtn.addEventListener('click', ()=>{ closeOverlay(which); });
              overlay.appendChild(inner);
              overlay.appendChild(closeBtn);
              document.body.appendChild(overlay);
              return overlay;
            };

            const clonePanelIntoOverlay = (which, triggerEl) => {
              const panelId = which === 'filters' ? 'panel-left' : 'panel-right';
              const panel = document.getElementById(panelId);
              if (!panel) return null;
              const overlay = buildOverlay(which, which === 'filters' ? 'Filters' : 'Composer information');
              const inner = overlay.querySelector('.overlay-inner');
              // remove any previous clone
              const existing = overlays.get(which);
              if (existing && existing.clone) { existing.clone.parentNode && existing.clone.parentNode.removeChild(existing.clone); }
              // deep clone the panel content so original DOM is untouched
              const clone = panel.cloneNode(true);
              clone.classList.add('mobile-overlay-clone');
              // Remove any IDs from clone to avoid duplicate IDs
              Array.from(clone.querySelectorAll('[id]')).forEach(n => n.removeAttribute('id'));
              // Append clone into inner
              inner.innerHTML = ''; inner.appendChild(clone);
              overlays.set(which, { overlay, trigger: triggerEl, clone, panel });
              // sync initial focus
              return { overlay, clone, panel };
            };

            const syncInputsBack = (clone, panel) => {
              if (!clone || !panel) return;
              const cloneInputs = Array.from(clone.querySelectorAll('input,textarea,select'));
              cloneInputs.forEach(cn => {
                // attempt to match by name, data-val or label text
                const name = cn.name || cn.getAttribute('data-val') || cn.getAttribute('data-name') || cn.getAttribute('value') || null;
                let target = null;
                if (name) target = panel.querySelector(`[name="${CSS.escape(name)}"]`) || panel.querySelector(`[data-val="${CSS.escape(name)}"]`) || panel.querySelector(`[data-name="${CSS.escape(name)}"]`);
                if (!target){
                  // fallback: try to match by input type and index
                  const inputs = Array.from(panel.querySelectorAll('input,textarea,select'));
                  const idx = Array.from(clone.querySelectorAll('input,textarea,select')).indexOf(cn);
                  if (inputs[idx]) target = inputs[idx];
                }
                if (!target) return;
                try{
                  if (target.type === 'checkbox' || target.type === 'radio') target.checked = cn.checked;
                  else target.value = cn.value;
                  // trigger input/change events on target so listeners react
                  target.dispatchEvent(new Event('input', { bubbles: true }));
                  target.dispatchEvent(new Event('change', { bubbles: true }));
                }catch(_){ }
              });
            };

            const trapFocus = (overlay) => {
              if (!overlay) return null;
              const inner = overlay.querySelector('.overlay-inner');
              const focusable = Array.from(inner.querySelectorAll(focusableSelector)).filter(n => !n.hasAttribute('disabled'));
              const first = focusable[0] || inner;
              const last = focusable[focusable.length-1] || first;
              const handler = (e) => {
                if (e.key !== 'Tab') return;
                if (focusable.length === 0){ e.preventDefault(); return; }
                if (e.shiftKey){ if (document.activeElement === first){ e.preventDefault(); last.focus(); } }
                else { if (document.activeElement === last){ e.preventDefault(); first.focus(); } }
              };
              document.addEventListener('keydown', handler);
              return () => { document.removeEventListener('keydown', handler); };
            };

            const openOverlay = (which, triggerEl) => {
              const { overlay, clone, panel } = clonePanelIntoOverlay(which, triggerEl) || {};
              if (!overlay) return;
              overlay.classList.add('open');
              // remember previously focused element
              const prevFocus = document.activeElement;
              overlays.get(which).prevFocus = prevFocus;
              // prevent background scroll
              document.body.style.overflow = 'hidden';
              // focus first focusable element inside
              setTimeout(()=>{
                try{ const inner = overlay.querySelector('.overlay-inner'); const focusable = inner.querySelectorAll(focusableSelector); if (focusable && focusable.length) focusable[0].focus(); else inner.focus(); }catch(_){ }
              }, 60);
              // install focus trap
              const releaseTrap = trapFocus(overlay);
              overlays.get(which).releaseTrap = releaseTrap;
            };

            const closeOverlay = (which) => {
              const state = overlays.get(which);
              if (!state) return;
              const { overlay, clone, panel, trigger, prevFocus, releaseTrap } = state;
              // copy input values from clone back to original panel
              try{ syncInputsBack(clone, panel); }catch(_){ }
              // run optional cleanup
              try{ overlay.classList.remove('open'); }catch(_){ }
              // allow body scroll again
              try{ document.body.style.overflow = ''; }catch(_){ }
              // remove clone after animation end
              try{
                const inner = overlay.querySelector('.overlay-inner');
                const onEnd = () => { try{ if (clone && clone.parentNode) clone.parentNode.removeChild(clone); }catch(_){} try{ if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); }catch(_){} if (releaseTrap) try{ releaseTrap(); }catch(_){ } if (prevFocus && prevFocus.focus) try{ prevFocus.focus(); }catch(_){ }; overlay.removeEventListener('transitionend', onEnd); };
                overlay.addEventListener('transitionend', onEnd);
                // fallback removal after 300ms
                setTimeout(onEnd, 350);
              }catch(_){ if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); if (releaseTrap) try{ releaseTrap(); }catch(_){ } if (prevFocus && prevFocus.focus) try{ prevFocus.focus(); }catch(_){ } }
              overlays.delete(which);
            };

            const closeAllOverlays = ()=>{ Array.from(overlays.keys()).forEach(k=> closeOverlay(k)); };

            // wire toolbar buttons
            if (mfFilters) mfFilters.addEventListener('click', (ev)=>{ ev.preventDefault(); if (window.innerWidth <= 600) { openOverlay('filters', mfFilters); } else { const el = document.getElementById('panel-left'); if (el) el.scrollIntoView({behavior:'smooth', block:'center'}); } });
            if (mfComposers) mfComposers.addEventListener('click', (ev)=>{ ev.preventDefault(); if (window.innerWidth <= 600){ openOverlay('composer', mfComposers); } else { window.location.href = '/composers'; } });

            // close overlays on escape
            document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeAllOverlays(); });
            // tap outside overlay inner to close (use capture to run before other handlers)
            document.addEventListener('click', (e)=>{ const open = document.querySelector('.mobile-overlay.open'); if (!open) return; const inner = open.querySelector('.overlay-inner'); if (!inner) return; if (!inner.contains(e.target) && !e.target.classList.contains('mf-btn') && !e.target.classList.contains('mf-center')){ closeAllOverlays(); } }, true);

            // Hamburger / swipe menu wiring
            const hamburger = document.getElementById('mf-hamburger');
            const swipeMenu = document.getElementById('mobile-swipe-menu');
            const swmClose = document.getElementById('swm-close');
            const swmFilters = document.getElementById('swm-filters');
            const swmComposers = document.getElementById('swm-composers');
            const swmHome = document.getElementById('swm-home');
            function openSwipeMenu(){ if (!swipeMenu) return; swipeMenu.setAttribute('aria-hidden','false'); if (hamburger) hamburger.setAttribute('aria-expanded','true'); document.body.style.overflow='hidden'; }
            function closeSwipeMenu(){ if (!swipeMenu) return; swipeMenu.setAttribute('aria-hidden','true'); if (hamburger) hamburger.setAttribute('aria-expanded','false'); document.body.style.overflow=''; }
            if (hamburger) hamburger.addEventListener('click', (ev)=>{ ev.preventDefault(); if (window.innerWidth <= 600) { openSwipeMenu(); } else { /* noop on desktop */ } });
            if (swmClose) swmClose.addEventListener('click', (ev)=>{ ev.preventDefault(); closeSwipeMenu(); });
            if (swmFilters) swmFilters.addEventListener('click', (ev)=>{ ev.preventDefault(); closeSwipeMenu(); if (window.innerWidth <= 600) { openOverlay('filters', document.getElementById('mf-filters')); } else { const el = document.getElementById('panel-left'); if (el) el.scrollIntoView({behavior:'smooth', block:'center'}); } });
            if (swmComposers) swmComposers.addEventListener('click', (ev)=>{ ev.preventDefault(); closeSwipeMenu(); if (window.innerWidth <= 600){ openOverlay('composer', document.getElementById('mf-composers')); } else { window.location.href = '/composers'; } });
            if (swmHome) swmHome.addEventListener('click', (ev)=>{ ev.preventDefault(); window.location.href = '/'; });

            // left-edge swipe to open filters: simple gesture detection
            try{
              let touchStartX = null; let touchStartY = null; let touchStartedAtEdge = false;
              window.addEventListener('touchstart', (e)=>{ const t = e.touches && e.touches[0]; if (!t) return; touchStartX = t.clientX; touchStartY = t.clientY; touchStartedAtEdge = touchStartX <= 24; });
              window.addEventListener('touchmove', (e)=>{ if (!touchStartedAtEdge) return; const t = e.touches && e.touches[0]; if (!t) return; const dx = t.clientX - touchStartX; const dy = Math.abs(t.clientY - touchStartY); if (dx > 60 && dy < 60){ // horizontal swipe right
                openSwipeMenu(); touchStartedAtEdge = false; }
              });
            }catch(_){ }
          }catch(_){ }
      }catch(_){ }
      // no autotest/debug behavior in production
    }catch(e){ const resultsEl = document.getElementById('results'); if (resultsEl) resultsEl.innerText = 'Initialization failed: ' + String(e); console.error('Initialization failed', e); }
  })();

  // expose helpers
  window.gvizFetch = gvizFetch;
  window.normalize = normalize;
  window.escapeHtml = escapeHtml;

  // basic wiring
  try{
  window.populateCountryCheckboxes().catch(()=>{});
  window.populateGenderCheckboxes && window.populateGenderCheckboxes().catch(()=>{});
    const sbtn = document.getElementById('qbtn'); if (sbtn) sbtn.addEventListener('click', ()=>{ window.currentPage = 1; window.loadResults(); });
    const qinputEl = document.getElementById('qinput'); if (qinputEl) qinputEl.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') { window.currentPage = 1; window.loadResults(); } });
  }catch(e){ console.error('client init failed', e); }

})();
