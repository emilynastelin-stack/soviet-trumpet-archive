/* Mobile panel bridge script (extracted from src/pages/composers-results.astro)
   Purpose: populate and show the mobile composer side panel by cloning or
   invoking the client runtime. Kept defensive and idempotent to avoid
   race conditions when other legacy scripts also try to populate composer UI.
*/
(function(){
  var _panelLeftPrevDisplay = null;
  var _filterBtnPrevDisabled = null;

  function showPanel(){
    try{
      try{ if (typeof window !== 'undefined' && window.innerWidth > 600) { return; } }catch(e){ }
      var p = document.getElementById('mobileSidePanel'); if(!p) return;
      try{ var left = document.getElementById('panel-left'); if (left){ _panelLeftPrevDisplay = left.style.display || ''; left.style.display = 'none'; } }catch(e){ }
      try{ var fbtn = document.getElementById('mf-filters'); if (fbtn){ _filterBtnPrevDisabled = !!fbtn.disabled; fbtn.disabled = true; fbtn.setAttribute('aria-disabled','true'); fbtn.classList && fbtn.classList.add('disabled'); } }catch(e){ }
      try{ var sm = document.getElementById('mobile-swipe-menu'); if (sm && sm.getAttribute('aria-hidden') === 'false'){ sm.setAttribute('aria-hidden','true'); } }catch(e){ }
      p.style.display = 'block';
      try{ p.setAttribute('aria-hidden','false'); }catch(e){ }
      try{
        var mobileInner = document.getElementById('composer-content-mobile-clone') || document.getElementById('mobilePanelContent');
        var desktopInner = document.getElementById('composer-content');
        if (mobileInner && desktopInner && desktopInner.innerHTML && String(desktopInner.innerHTML).trim().length > 10){
          try{ mobileInner.innerHTML = desktopInner.innerHTML; }catch(e){ }
        }
      }catch(e){ }
      setTimeout(function(){ try{ var closeBtn = document.getElementById('closePanelBtn'); if (closeBtn && typeof closeBtn.focus === 'function'){ closeBtn.focus({ preventScroll: true }); } }catch(e){ } }, 20);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }catch(e){console.warn(e)}
  }

  function hidePanel(){
    try{
      var p = document.getElementById('mobileSidePanel'); if(!p) return;
      try{ var tbtn = document.getElementById('togglePanelBtn'); if (tbtn && typeof tbtn.focus === 'function'){ tbtn.focus({ preventScroll: true }); } }catch(e){ }
      try{ var active = document.activeElement; if (active && p.contains(active)){ try{ active.blur(); }catch(e){ } } }catch(e){ }
      try{ p.setAttribute('aria-hidden','true'); }catch(e){ }
      p.style.display='none';
      try{ var left = document.getElementById('panel-left'); if (left && _panelLeftPrevDisplay !== null){ left.style.display = _panelLeftPrevDisplay || ''; _panelLeftPrevDisplay = null; } }catch(e){ }
      try{ var fbtn = document.getElementById('mf-filters'); if (fbtn && _filterBtnPrevDisabled !== null){ fbtn.disabled = !!_filterBtnPrevDisabled; if (!fbtn.disabled) fbtn.removeAttribute('aria-disabled'); else fbtn.setAttribute('aria-disabled','true'); fbtn.classList && fbtn.classList.remove('disabled'); _filterBtnPrevDisabled = null; } }catch(e){ }
    }catch(e){}
  }

  function populateAndShowFromCard(card){
    try{
      try{ if (typeof window !== 'undefined' && window.innerWidth > 600) { return; } }catch(e){ }
      if (window.__mobilePanelPopulating) return;
      window.__mobilePanelPopulating = true;
      try{ var panels = document.querySelectorAll('#mobileSidePanel'); if (panels && panels.length > 1){ for (var pi = 1; pi < panels.length; pi++){ try{ panels[pi].remove(); }catch(e){ } } } }catch(e){ }
      if(!card){ window.__mobilePanelPopulating = false; return; }
      var main = card.querySelector('.result-main');
      var title = '';
      try{ var b = main && main.querySelector('b'); if(b) title = (b.textContent || '').trim(); }catch(e){ }

      function extractComposerFromCard(c){
        try{
          if (!c) return '';
          var ps = c.querySelectorAll('p');
          for (var i=0;i<ps.length;i++){
            try{
              var txt = (ps[i].textContent || '').trim();
              var m = txt.match(/Composer[:\s]*\s*(.+)/i);
              if (m && m[1]){
                var name = m[1].trim();
                name = name.replace(/\s*[Pp]ublished[:\s].*$/,'');
                name = name.replace(/\s*About this composer.*$/i,'');
                return name.trim();
              }
            }catch(e){ }
          }
          var lines = (c.innerText || '').split(/[\r\n]+/).map(function(s){ return (s||'').trim(); }).filter(Boolean);
          for (var j=0;j<lines.length;j++){
            if (/,/.test(lines[j]) && /[A-Za-z]/.test(lines[j])) return lines[j];
          }
        }catch(e){ }
        return '';
      }

      var composerName = '';
      try{ composerName = extractComposerFromCard(card) || ''; }catch(e){ composerName = ''; }
      var nameToUse = (composerName && String(composerName).trim()) ? String(composerName).trim() : String(title || '').trim();
      if (nameToUse && window && typeof window.openComposerFromName === 'function'){
        try{ window.openComposerFromName(nameToUse, card); }catch(e){ }
      }

      var content = document.getElementById('mobilePanelContent');
      var panelRight = document.getElementById('panel-right');
      try{
        if (panelRight && content){
          var clone = panelRight.cloneNode(true);
          try{ if (clone.id) clone.id = 'panel-right-mobile-clone'; var innerIds = ['composer-content','more-from-composer','clear-composer']; innerIds.forEach(function(id){ var el = clone.querySelector('#'+id); if (el) { el.id = id + '-mobile-clone'; } }); }catch(e){ }
          try{ var existingClone = content.querySelector('#panel-right-mobile-clone'); if (existingClone) existingClone.remove(); }catch(e){ }
          content.innerHTML = '';
          content.appendChild(clone);
          try{
            var desktopNowInit = document.getElementById('composer-content');
            var mobileContentInit = document.getElementById('composer-content-mobile-clone');
            if (desktopNowInit && mobileContentInit && desktopNowInit.innerHTML && String(desktopNowInit.innerHTML).trim().length > 10){
              try{ mobileContentInit.innerHTML = desktopNowInit.innerHTML; }catch(e){ }
            }
          }catch(e){ }

          if (nameToUse && window && typeof window.populateComposerBox === 'function'){
            try{
              window.selectedComposer = nameToUse;
              window.populateComposerBox(nameToUse, null);
              try{ if (typeof window.openComposerFromName === 'function') { window.openComposerFromName(nameToUse, null); } }catch(e){}
              var waited = 0;
              var interval = setInterval(function(){
                try{
                  var desktopContent = document.getElementById('composer-content');
                  var mobileContent = document.getElementById('composer-content-mobile-clone');
                  if (desktopContent && desktopContent.innerHTML && String(desktopContent.innerHTML).trim().length > 10){
                    if (mobileContent) mobileContent.innerHTML = desktopContent.innerHTML;
                    try{ var more = document.getElementById('more-from-composer'); var moreM = document.getElementById('more-from-composer-mobile-clone'); if (more && moreM) moreM.innerHTML = more.innerHTML; }catch(e){}
                    clearInterval(interval);
                    return;
                  }
                  waited += 100;
                  if (waited > 3000){ clearInterval(interval); }
                }catch(e){ clearInterval(interval); }
              }, 100);
            }catch(e){ }
          }

          try{
            var onPopulated = function(ev){
              try{
                var mobileContentNow = document.getElementById('composer-content-mobile-clone');
                if (mobileContentNow && ev && ev.detail && ev.detail.html){
                  mobileContentNow.innerHTML = ev.detail.html;
                } else {
                  var desktopNow = document.getElementById('composer-content');
                  if (mobileContentNow && desktopNow) mobileContentNow.innerHTML = desktopNow.innerHTML;
                }
                try{ var more = document.getElementById('more-from-composer'); var moreM2 = document.getElementById('more-from-composer-mobile-clone'); if (more && moreM2) moreM2.innerHTML = more.innerHTML; }catch(e){}
              }catch(e){}
            };
            document.removeEventListener('composerPopulated', onPopulated);
            document.addEventListener('composerPopulated', onPopulated);
            try{ window.onComposerPopulated = function(name){ try{ var ev2 = { detail: { name: name, html: (document.getElementById('composer-content')||{}).innerHTML || '' } }; onPopulated(ev2); }catch(e){ } }; }catch(e){}
          }catch(e){}

        } else if (content){
          if (main){ content.innerHTML = main.innerHTML; }
          else if (title) { content.textContent = title; }
        }
      }catch(e){ if (content){ if (main){ content.innerHTML = main.innerHTML; } else if (title) { content.textContent = title; } } }
      try{ window.__mobilePanelPopulating = false; }catch(e){ }
      showPanel();
    }catch(e){ try{ window.__mobilePanelPopulating = false; }catch(e){ } console.warn('populateFromCard failed', e); }
  }

  document.addEventListener('DOMContentLoaded', function(){
    var t = document.getElementById('togglePanelBtn'); if(t) t.addEventListener('click', function(ev){ ev.preventDefault && ev.preventDefault(); showPanel(); });
    var c = document.getElementById('closePanelBtn'); if(c) c.addEventListener('click', function(ev){ ev.preventDefault && ev.preventDefault(); hidePanel(); });
    var results = document.getElementById('results-list');
    if (results){
      results.addEventListener('click', function(ev){
        try{
          var targetButton = ev.target && ev.target.closest ? ev.target.closest('.more-composer-btn, .about-label') : null;
          if (targetButton){
            var cardFromBtn = targetButton.closest ? targetButton.closest('.result-card') : null;
            if (cardFromBtn){
              ev.preventDefault && ev.preventDefault(); ev.stopPropagation && ev.stopPropagation();
              if (typeof window !== 'undefined' && window.innerWidth > 600){
                try{
                  var composerName = '';
                  try{ var link = cardFromBtn.querySelector('.composer-link[data-name]') || cardFromBtn.querySelector('.composer-link'); if (link) composerName = (link.getAttribute && link.getAttribute('data-name')) || (link.textContent && link.textContent.trim()) || ''; }catch(e){}
                  if (!composerName){ try{ var p = cardFromBtn.querySelector('p'); if (p && /Composer/i.test(p.textContent || '')) composerName = p.textContent.replace(/.*Composer[:\s]*/i,'').trim(); }catch(e){} }
                  if (composerName && typeof window.openComposerFromName === 'function'){ try{ window.openComposerFromName(composerName, cardFromBtn); }catch(e){} }
                  else { try{ var elp = document.getElementById('panel-right'); if (elp) elp.scrollIntoView({behavior:'smooth', block:'center'}); var content = document.getElementById('composer-content'); if (content) content.textContent = composerName || ''; }catch(e){} }
                }catch(e){}
                return;
              }
              populateAndShowFromCard(cardFromBtn);
              return;
            }
          }
          if (ev.target && ev.target.closest && ev.target.closest('a')) return;
          var card = ev.target && ev.target.closest ? ev.target.closest('.result-card') : null;
          if (!card) return;
          ev.preventDefault && ev.preventDefault(); ev.stopPropagation && ev.stopPropagation();
          if (typeof window !== 'undefined' && window.innerWidth > 600){
            try{
              var composerName2 = '';
              try{ var link2 = card.querySelector('.composer-link[data-name]') || card.querySelector('.composer-link'); if (link2) composerName2 = (link2.getAttribute && link2.getAttribute('data-name')) || (link2.textContent && link2.textContent.trim()) || ''; }catch(e){}
              if (!composerName2){ try{ var p2 = card.querySelector('p'); if (p2 && /Composer/i.test(p2.textContent || '')) composerName2 = p2.textContent.replace(/.*Composer[:\s]*/i,'').trim(); }catch(e){} }
              if (composerName2 && typeof window.openComposerFromName === 'function'){ try{ window.openComposerFromName(composerName2, card); }catch(e){} }
              else { try{ var elp2 = document.getElementById('panel-right'); if (elp2) elp2.scrollIntoView({behavior:'smooth', block:'center'}); var content2 = document.getElementById('composer-content'); if (content2) content2.textContent = composerName2 || ''; }catch(e){} }
            }catch(e){}
          } else {
            populateAndShowFromCard(card);
          }
        }catch(e){ }
      }, true);
    }
  });

  window.showMobileComposerPanel = showPanel; window.hideMobileComposerPanel = hidePanel; window.populateMobilePanelFromCard = populateAndShowFromCard;
})();
// Consolidated client-only scripts for composers-results page
// Moved out of the Astro page so SSR/Vite/esbuild won't parse them on the server.
(function(){
  // Force English locale on this results page to keep filter labels consistent
  try{ localStorage.setItem('locale','en'); }catch(e){}

  // Defensive shim: ensure a callable openComposerFromName exists before the heavy client loads.
  (function(){
    try{
      if (window && typeof window.openComposerFromName !== 'function'){
        window.openComposerFromName = function(name, row){
          try{
            window.selectedComposer = String(name || '');
            var content = document.getElementById('composer-content');
            if (content) { content.textContent = String(name || ''); }
            if (window.innerWidth <= 600){
              if (!document.querySelector('.mobile-overlay.right')){
                var overlay = document.createElement('div');
                overlay.className = 'mobile-overlay right';
                overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
                overlay.style.position = 'fixed'; overlay.style.inset = '0'; overlay.style.zIndex = '1990'; overlay.style.background = 'rgba(0,0,0,0.18)';
                var inner = document.createElement('div');
                inner.className = 'overlay-inner overlay-right-inner';
                inner.style.position = 'absolute'; inner.style.top = '0'; inner.style.bottom = '0'; inner.style.right = '0'; inner.style.left = 'auto';
                inner.style.width = 'min(92%, 420px)'; inner.style.maxWidth = '420px'; inner.style.zIndex = '1995'; inner.style.background = 'white'; inner.style.boxSizing = 'border-box'; inner.style.padding = '16px';
                var panel = document.getElementById('panel-right');
                if (panel){
                  var clone = panel.cloneNode(true);
                  clone.id = 'panel-right-mobile-clone'; clone.classList.add('mobile-overlay-clone'); clone.style.margin = '0'; clone.style.padding = '0'; clone.style.width = '100%';
                  inner.appendChild(clone);
                } else {
                  inner.innerHTML = '<div style="padding:12px">Composer</div>';
                }
            overlay.appendChild(inner);
            document.body.appendChild(overlay);
            try{ window.__mobileOverlayLock = 'filters'; }catch(_){ }
            // robust body lock
            try{
              var _s = window.scrollY || document.documentElement.scrollTop || 0;
              overlay.__savedScrollY = _s;
              document.body.style.position = 'fixed';
              document.body.style.top = '-' + _s + 'px';
              document.body.style.left = '0';
              document.body.style.right = '0';
              document.body.style.width = '100%';
              document.documentElement.style.overflow = 'hidden';
              document.body.style.overflow = 'hidden';
            }catch(_){ }
            try{ var c = document.getElementById('panel-left-mobile-clone'); if (c){ var fb = c.querySelector && c.querySelector('.filter-box'); if (fb){ fb.style.position='absolute'; fb.style.top='60px'; fb.style.bottom='0'; fb.style.left='0'; fb.style.right='0'; fb.style.overflowY='auto'; fb.style.webkitOverflowScrolling='touch'; fb.style.padding='0 16px'; fb.style.boxSizing='border-box'; } } }catch(_){ }
            overlay.addEventListener('click', function(ev){ if (ev.target === overlay) { overlay.remove(); try{ if (window.__mobileOverlayLock === 'filters') window.__mobileOverlayLock = null; }catch(_){ } } });
              }
            } else {
              var elp = document.getElementById('panel-right'); if (elp) elp.scrollIntoView({behavior:'smooth', block:'center'});
            }
            return true;
          }catch(e){ return false; }
        };
      }
    }catch(e){ /* ignore */ }
  })();

  // Bridge for static template buttons
  function filterByComposer(name){
    try{
      if (window && typeof window.filterByComposer === 'function'){
        return window.filterByComposer(name);
      }
      window.__filterByComposerName = name;
      if (typeof window.loadResults === 'function'){
        window.currentPage = 1;
        return window.loadResults({ composer: name });
      }
      console.log('filterByComposer placeholder set:', name);
    }catch(e){ console.warn('filterByComposer failed', e); }
  }
  window.filterByComposer = filterByComposer;

  // Select All / Clear All for filter groups — dispatches change events and triggers loadResults
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.filter-group').forEach(group => {
      const selectAll = group.querySelector('.select-all');
      const clearAll = group.querySelector('.clear-all');
      const checks = Array.from(group.querySelectorAll('input[type="checkbox"]'));
      const dispatchChange = (el) => {
        try{ const ev = new Event('change', { bubbles: true }); el.dispatchEvent(ev); }
        catch(_){ try{ const ev2 = document.createEvent('HTMLEvents'); ev2.initEvent('change', true, false); el.dispatchEvent(ev2); }catch(_){}}
      };
      const applyAndNotify = (val) => { checks.forEach(c => { c.checked = val; dispatchChange(c); }); try{ if (window && typeof window.loadResults === 'function'){ window.currentPage = 1; window.loadResults(); } }catch(_){ } };
      if (selectAll) selectAll.addEventListener('click', (e) => { e.preventDefault(); applyAndNotify(true); });
      if (clearAll) clearAll.addEventListener('click', (e) => { e.preventDefault(); applyAndNotify(false); });
    });
  });

  // Republic-change fallback: minimal /api/sheets fetch + filter by the 'Soviet republic' column
  document.addEventListener('DOMContentLoaded', ()=>{
    const esc = (s)=> String(s==null? '': s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    const getCheckedRepublics = ()=> Array.from(document.querySelectorAll('#filter-republic input[type=checkbox]:checked')).map(cb=> decodeURIComponent(cb.dataset.val || cb.getAttribute('data-val') || '').trim()).filter(Boolean);
    async function fallbackFilterAndRender(){
      const checked = getCheckedRepublics();
      if (typeof window.loadResults === 'function'){
        try{ window.currentPage = 1; window.loadResults(); }catch(e){ console.warn('loadResults call failed', e); }
        return;
      }
      try{
        const res = await fetch('/api/sheets', { headers: { 'Accept': 'application/json' } });
        const raw = await res.json().catch(()=>null);
        const rows = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.rows) ? raw.rows : raw);
        const normalizedChecked = checked.map(c=> c.toLowerCase());
        const filtered = (rows || []).filter(r => {
          const val = ( (r && (r['Soviet republic'] || r['Soviet Republic'] || r['Republic'] || r['Republic/Region'])) || '' ).toString().toLowerCase();
          if (!normalizedChecked.length) return true;
          return normalizedChecked.some(sc => val.includes(sc));
        });
        const container = document.getElementById('results-list');
        if (!container) return;
        container.innerHTML = '';
        if (!filtered.length){ container.innerHTML = '<div class="result-item">No results</div>'; return; }
        const pageSize = window.PAGE_SIZE || 25;
        filtered.slice(0, pageSize).forEach(r => {
          const title = r.Title || r.Compositions || r.title || '';
          const author = r['Composer'] || r.Composer || r.composer || '';
          const published = r.Published || r.Year || r['Date'] || r['Published'] || '';
          const pieceType = r['Type'] || r['Type of piece'] || r.Type || '';
          const republic = r['Soviet republic'] || r['Soviet Republic'] || r['Republic'] || r['Republic/Region'] || '';
          const div = document.createElement('div'); div.className = 'result-card';
          div.innerHTML = `\n              <div class="result-main">\n                <b>${esc(title)}</b>\n                <div style="margin-top:6px;color:#6b7280;font-size:0.95rem">\n                  ${pieceType ? esc(pieceType) + (published ? ' · ' : '') : ''}${published ? esc(published) : ''}\n                </div>\n                <div style="margin-top:8px"><strong>Composer:</strong> ${esc(author)}</div>\n                ${republic ? `<div style="margin-top:6px;color:#6b7280;font-size:0.9rem">${esc(republic)}</div>` : ''}\n              </div>\n              <div class="result-right"></div>\n            `;
          container.appendChild(div);
        });
      }catch(e){ console.error('Fallback republic filter failed', e); }
    }
    try{ document.querySelectorAll('#filter-republic input[type=checkbox]').forEach(cb=> cb.addEventListener('change', ()=>{ fallbackFilterAndRender(); })); }catch(e){}
    setTimeout(()=>{ try{ fallbackFilterAndRender(); }catch(_){} }, 50);
  });

  // Mobile-only: open an empty right-side panel when a result card is clicked.
  (function(){
    function openEmptyRightPanel(){
      if (document.querySelector('.mobile-overlay.right')) return;
      var overlay = document.createElement('div');
      overlay.className = 'mobile-overlay right';
      overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
      overlay.style.position = 'fixed'; overlay.style.inset = '0'; overlay.style.zIndex = '1990'; overlay.style.background = 'rgba(0,0,0,0.18)';
      var inner = document.createElement('div');
      inner.className = 'overlay-inner overlay-right-inner';
      inner.style.position = 'absolute'; inner.style.top = '0'; inner.style.bottom = '0'; inner.style.right = '0'; inner.style.left = 'auto';
      inner.style.width = 'min(92%, 420px)'; inner.style.maxWidth = '420px'; inner.style.zIndex = '1995'; inner.style.background = 'white'; inner.style.boxSizing = 'border-box'; inner.style.padding = '12px';
      var header = document.createElement('div'); header.style.display = 'flex'; header.style.alignItems = 'center'; header.style.justifyContent = 'space-between';
      var title = document.createElement('div'); title.textContent = '';
      var closeBtn = document.createElement('button'); closeBtn.type = 'button'; closeBtn.innerHTML = '✕'; closeBtn.style.border = '0'; closeBtn.style.background = 'transparent'; closeBtn.style.fontSize = '1.1rem'; closeBtn.style.cursor = 'pointer';
      closeBtn.addEventListener('click', function(){ try{ overlay.remove(); }catch(_){} });
      header.appendChild(title); header.appendChild(closeBtn);
      inner.appendChild(header);
      var body = document.createElement('div'); body.style.minHeight = '40vh'; body.style.color = '#111'; inner.appendChild(body);
  overlay.appendChild(inner);
  document.body.appendChild(overlay);
  try{ window.__mobileOverlayLock = 'composer'; }catch(_){ }
  overlay.addEventListener('click', function(ev){ if (ev.target === overlay) { overlay.remove(); try{ if (window.__mobileOverlayLock === 'composer') window.__mobileOverlayLock = null; }catch(_){ } } });
    }

    document.addEventListener('click', function delegatedAboutClick(ev){
      try{
        var about = ev.target && ev.target.closest ? ev.target.closest('.about-label, .about-badge') : null;
        if (!about) return;
        if (window.innerWidth > 600) return;
        ev.preventDefault && ev.preventDefault(); ev.stopPropagation && ev.stopPropagation();
        var composerName = '';
        try{
          var card = about.closest ? about.closest('.result-card') : null;
          if (card){
            var link = card.querySelector('.composer-link[data-name]') || card.querySelector('.composer-link');
            if (link) composerName = (link.getAttribute && link.getAttribute('data-name')) || (link.textContent && link.textContent.trim()) || '';
          }
          if (!composerName){
            var group = about.closest ? about.closest('.composer-group') : null;
            if (group){
              var h = group.querySelector('h3'); if (h && h.textContent) composerName = h.textContent.trim();
            }
          }
        }catch(_){ composerName = ''; }

        if (composerName && window && typeof window.openComposerFromName === 'function'){
          try{ var ok = window.openComposerFromName(composerName); if (ok) return; }catch(_){ }
        }
        openEmptyRightPanel();
      }catch(_){ }
    }, { capture: false });
  })();

  // Mobile panel population and show/hide logic (clone + sync with runtime)
  (function(){
    var _panelLeftPrevDisplay = null;
    var _filterBtnPrevDisabled = null;
    function showPanel(){
      try{
        try{ if (typeof window !== 'undefined' && window.innerWidth > 600) { console.debug && console.debug('[page] showPanel ignored on desktop'); return; } }catch(_){ }
        var p = document.getElementById('mobileSidePanel'); if(!p) return;
        try{ var left = document.getElementById('panel-left'); if (left){ _panelLeftPrevDisplay = left.style.display || ''; left.style.display = 'none'; } }catch(_){ }
        try{ var fbtn = document.getElementById('mf-filters'); if (fbtn){ _filterBtnPrevDisabled = !!fbtn.disabled; fbtn.disabled = true; fbtn.setAttribute('aria-disabled','true'); fbtn.classList && fbtn.classList.add('disabled'); } }catch(_){ }
        try{ var sm = document.getElementById('mobile-swipe-menu'); if (sm && sm.getAttribute('aria-hidden') === 'false'){ sm.setAttribute('aria-hidden','true'); } }catch(_){ }
        p.style.display = 'block'; try{ p.setAttribute('aria-hidden','false'); }catch(_){ }
        try{
          var mobileInner = document.getElementById('composer-content-mobile-clone') || document.getElementById('mobilePanelContent');
          var desktopInner = document.getElementById('composer-content');
          if (mobileInner && desktopInner && desktopInner.innerHTML && String(desktopInner.innerHTML).trim().length > 10){ try{ mobileInner.innerHTML = desktopInner.innerHTML; }catch(_){ } }
        }catch(_){ }
        setTimeout(function(){ try{ var closeBtn = document.getElementById('closePanelBtn'); if (closeBtn && typeof closeBtn.focus === 'function'){ closeBtn.focus({ preventScroll: true }); } }catch(_){ } }, 20);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }catch(e){console.warn(e)}
    }
    function hidePanel(){
      try{
        var p = document.getElementById('mobileSidePanel'); if(!p) return;
        try{ var tbtn = document.getElementById('togglePanelBtn'); if (tbtn && typeof tbtn.focus === 'function'){ tbtn.focus({ preventScroll: true }); } }catch(_){ }
        try{ var active = document.activeElement; if (active && p.contains(active)){ try{ active.blur(); }catch(_){ } } }catch(_){ }
        try{ p.setAttribute('aria-hidden','true'); }catch(_){ }
        p.style.display='none';
        try{ var left = document.getElementById('panel-left'); if (left && _panelLeftPrevDisplay !== null){ left.style.display = _panelLeftPrevDisplay || ''; _panelLeftPrevDisplay = null; } }catch(_){ }
        try{ var fbtn = document.getElementById('mf-filters'); if (fbtn && _filterBtnPrevDisabled !== null){ fbtn.disabled = !!_filterBtnPrevDisabled; if (!fbtn.disabled) fbtn.removeAttribute('aria-disabled'); else fbtn.setAttribute('aria-disabled','true'); fbtn.classList && fbtn.classList.remove('disabled'); _filterBtnPrevDisabled = null; } }catch(_){ }
      }catch(e){}
    }

    function populateAndShowFromCard(card){
      try{
        try{ if (typeof window !== 'undefined' && window.innerWidth > 600) { console.debug && console.debug('[page] populateAndShowFromCard ignored on desktop'); return; } }catch(_){ }
        try{ console.debug && console.debug('[page] populateAndShowFromCard called for card:', card); }catch(_){ }
        if (window.__mobilePanelPopulating) return;
        window.__mobilePanelPopulating = true;
        try{ var panels = document.querySelectorAll('#mobileSidePanel'); if (panels && panels.length > 1){ for (var pi = 1; pi < panels.length; pi++){ try{ panels[pi].remove(); }catch(_){ } } } }catch(_){ }
        if(!card) return;
        var main = card.querySelector('.result-main');
        var title = '';
        try{ var b = main && main.querySelector('b'); if(b) title = (b.textContent || '').trim(); }catch(_){ }
        function extractComposerFromCard(c){
          try{
            if (!c) return '';
            var ps = c.querySelectorAll('p');
            for (var i=0;i<ps.length;i++){
              try{
                var txt = (ps[i].textContent || '').trim();
                var m = txt.match(/Composer[:\s]*\s*(.+)/i);
                if (m && m[1]){
                  var name = m[1].trim();
                  name = name.replace(/\s*[Pp]ublished[:\s].*$/,'');
                  name = name.replace(/\s*About this composer.*$/i,'');
                  return name.trim();
                }
              }catch(_){ }
            }
            var lines = (c.innerText || '').split(/[\r\n]+/).map(function(s){ return (s||'').trim(); }).filter(Boolean);
            for (var j=0;j<lines.length;j++){ if (/,/.test(lines[j]) && /[A-Za-z]/.test(lines[j])) return lines[j]; }
          }catch(_){ }
          return '';
        }
        var composerName = '';
        try{ composerName = extractComposerFromCard(card) || ''; }catch(_){ composerName = ''; }
        try{ console.debug && console.debug('[page] extracted composer name:', composerName); }catch(_){ }
        var nameToUse = (composerName && String(composerName).trim()) ? String(composerName).trim() : String(title || '').trim();
        if (nameToUse && window && typeof window.openComposerFromName === 'function'){ try{ window.openComposerFromName(nameToUse, card); }catch(_){ } }
        var content = document.getElementById('mobilePanelContent');
        var panelRight = document.getElementById('panel-right');
        try{
          if (panelRight && content){
            var clone = panelRight.cloneNode(true);
            try{ if (clone.id) clone.id = 'panel-right-mobile-clone'; var innerIds = ['composer-content','more-from-composer','clear-composer']; innerIds.forEach(function(id){ var el = clone.querySelector('#'+id); if (el) { el.id = id + '-mobile-clone'; } }); }catch(_){ }
            try{ var existingClone = content.querySelector('#panel-right-mobile-clone'); if (existingClone) existingClone.remove(); }catch(_){ }
            content.innerHTML = '';
            content.appendChild(clone);
            try{ var desktopNowInit = document.getElementById('composer-content'); var mobileContentInit = document.getElementById('composer-content-mobile-clone'); if (desktopNowInit && mobileContentInit && desktopNowInit.innerHTML && String(desktopNowInit.innerHTML).trim().length > 10){ try{ mobileContentInit.innerHTML = desktopNowInit.innerHTML; }catch(_){ } } }catch(_){ }
            if (nameToUse && window && typeof window.populateComposerBox === 'function'){
              try{
                try{ console.debug && console.debug('[page] invoking runtime.populateComposerBox for:', nameToUse); }catch(_){ }
                window.selectedComposer = nameToUse;
                window.populateComposerBox(nameToUse, null);
                try{ if (typeof window.openComposerFromName === 'function') { console.debug && console.debug('[page] also calling openComposerFromName for:', nameToUse); window.openComposerFromName(nameToUse, null); } }catch(_){ }
                var waited = 0;
                var interval = setInterval(function(){
                  try{
                    var desktopContent = document.getElementById('composer-content');
                    var mobileContent = document.getElementById('composer-content-mobile-clone');
                    if (desktopContent && desktopContent.innerHTML && String(desktopContent.innerHTML).trim().length > 10){ if (mobileContent) mobileContent.innerHTML = desktopContent.innerHTML; try{ var more = document.getElementById('more-from-composer'); var moreM = document.getElementById('more-from-composer-mobile-clone'); if (more && moreM) moreM.innerHTML = more.innerHTML; }catch(_){ } clearInterval(interval); return; }
                    waited += 100;
                    if (waited > 3000){ clearInterval(interval); }
                  }catch(_){ clearInterval(interval); }
                }, 100);
              }catch(e){ /* ignore runtime errors and leave clone as-is */ }
            }
            try{
              var onPopulated = function(ev){
                try{
                  try{ console.debug && console.debug('[page] composerPopulated event received for:', ev && ev.detail && ev.detail.name); }catch(_){ }
                  var mobileContentNow = document.getElementById('composer-content-mobile-clone');
                  if (mobileContentNow && ev && ev.detail && ev.detail.html){ mobileContentNow.innerHTML = ev.detail.html; }
                  else { var desktopNow = document.getElementById('composer-content'); if (mobileContentNow && desktopNow) mobileContentNow.innerHTML = desktopNow.innerHTML; }
                  try{ var more = document.getElementById('more-from-composer'); var moreM2 = document.getElementById('more-from-composer-mobile-clone'); if (more && moreM2) moreM2.innerHTML = more.innerHTML; }catch(_){ }
                }catch(_){ }
              };
              document.removeEventListener('composerPopulated', onPopulated);
              document.addEventListener('composerPopulated', onPopulated);
              try{ window.onComposerPopulated = function(name){ try{ var ev2 = { detail: { name: name, html: (document.getElementById('composer-content')||{}).innerHTML || '' } }; onPopulated(ev2); }catch(_){ } }; }catch(_){ }
            }catch(_){ }
          } else if (content){ if (main){ content.innerHTML = main.innerHTML; } else if (title) { content.textContent = title; } }
        }catch(e){ if (content){ if (main){ content.innerHTML = main.innerHTML; } else if (title) { content.textContent = title; } } }
        try{ window.__mobilePanelPopulating = false; }catch(_){ }
        showPanel();
      }catch(e){ try{ window.__mobilePanelPopulating = false; }catch(_){ } console.warn('populateFromCard failed', e); }
    }

    document.addEventListener('DOMContentLoaded', function(){
      var t = document.getElementById('togglePanelBtn'); if(t) t.addEventListener('click', function(ev){ ev.preventDefault && ev.preventDefault(); showPanel(); });
      var c = document.getElementById('closePanelBtn'); if(c) c.addEventListener('click', function(ev){ ev.preventDefault && ev.preventDefault(); hidePanel(); });
      var results = document.getElementById('results-list');
      if (results){
        results.addEventListener('click', function(ev){
          try{
            var targetButton = ev.target && ev.target.closest ? ev.target.closest('.more-composer-btn, .about-label') : null;
            if (targetButton){
              try{ console.debug && console.debug('[page] composer button clicked', targetButton); }catch(_){ }
              var cardFromBtn = targetButton.closest ? targetButton.closest('.result-card') : null;
              if (cardFromBtn){
                ev.preventDefault && ev.preventDefault(); ev.stopPropagation && ev.stopPropagation();
                if (typeof window !== 'undefined' && window.innerWidth > 600){
                  try{
                    var composerName = '';
                    try{ var link = cardFromBtn.querySelector('.composer-link[data-name]') || cardFromBtn.querySelector('.composer-link'); if (link) composerName = (link.getAttribute && link.getAttribute('data-name')) || (link.textContent && link.textContent.trim()) || ''; }catch(_){ }
                    if (!composerName){ try{ var p = cardFromBtn.querySelector('p'); if (p && /Composer/i.test(p.textContent || '')) composerName = p.textContent.replace(/.*Composer[:\s]*/i,'').trim(); }catch(_){ } }
                    if (composerName && typeof window.openComposerFromName === 'function'){ try{ window.openComposerFromName(composerName, cardFromBtn); }catch(_){ } }
                    else { try{ var elp = document.getElementById('panel-right'); if (elp) elp.scrollIntoView({behavior:'smooth', block:'center'}); var content = document.getElementById('composer-content'); if (content) content.textContent = composerName || ''; }catch(_){ } }
                  }catch(_){ }
                  return;
                }
                populateAndShowFromCard(cardFromBtn);
                return;
              }
            }
            if (ev.target && ev.target.closest && ev.target.closest('a')) return;
            var card = ev.target && ev.target.closest ? ev.target.closest('.result-card') : null;
            if (!card) return;
            ev.preventDefault && ev.preventDefault(); ev.stopPropagation && ev.stopPropagation();
            try{ console.debug && console.debug('[page] result-card clicked - opening panel'); }catch(_){ }
            if (typeof window !== 'undefined' && window.innerWidth > 600){
              try{
                var composerName2 = '';
                try{ var link2 = card.querySelector('.composer-link[data-name]') || card.querySelector('.composer-link'); if (link2) composerName2 = (link2.getAttribute && link2.getAttribute('data-name')) || (link2.textContent && link2.textContent.trim()) || ''; }catch(_){ }
                if (!composerName2){ try{ var p2 = card.querySelector('p'); if (p2 && /Composer/i.test(p2.textContent || '')) composerName2 = p2.textContent.replace(/.*Composer[:\s]*/i,'').trim(); }catch(_){ } }
                if (composerName2 && typeof window.openComposerFromName === 'function'){ try{ window.openComposerFromName(composerName2, card); }catch(_){ } }
                else { try{ var elp2 = document.getElementById('panel-right'); if (elp2) elp2.scrollIntoView({behavior:'smooth', block:'center'}); var content2 = document.getElementById('composer-content'); if (content2) content2.textContent = composerName2 || ''; }catch(_){ } }
              }catch(_){ }
            } else {
              populateAndShowFromCard(card);
            }
          }catch(e){ /* ignore */ }
        }, true);
      }
    });

    window.showMobileComposerPanel = showPanel; window.hideMobileComposerPanel = hidePanel; window.populateMobilePanelFromCard = populateAndShowFromCard;
  })();

})();
