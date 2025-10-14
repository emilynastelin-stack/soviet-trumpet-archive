(function(){
  // Inject header and footer DOM only on desktop widths (>= 601px)
  function shouldInject(){ try{ return window.innerWidth >= 601; }catch(e){ return false; } }

  function createHeader(){
    var header = document.createElement('header');
    header.style.position='fixed'; header.style.left='0'; header.style.right='0'; header.style.top='0'; header.style.zIndex='100005'; header.style.background='white';
    header.innerHTML = '\n+  <div class="container nav" style="display:flex;justify-content:space-between;align-items:center">\n+    <div>\n+      <button class="header-hamburger" id="headerHamburger" aria-label="Open menu" style="display:none;margin-right:8px;">☰</button>\n+    </div>\n+    <div class="logo">\n+      <a href="/composers" aria-label="Back to composers" title="Back to composers">\n+        <span class="nav-english" id="navEnglish">Archive of Soviet Trumpet Music</span>\n+        <span class="nav-pipe">|</span>\n+        <span class="nav-russian" id="navRussian" lang="ru" style="font-family: \'Segoe UI\', \'Noto Sans\', Arial, sans-serif;">Архив советской трубной музыки</span>\n+      </a>\n+    </div>\n+    <div class="lang-toggle" id="langToggle">\n+      <button class="lang-btn" id="langBtn">EN ▾</button>\n+      <div class="lang-dropdown" id="langDropdown">\n+        <div class="lang-option" data-locale="en">English</div>\n+        <div class="lang-option" data-locale="de">Deutsch</div>\n+      </div>\n+    </div>\n+  </div>\n\n+  <script>\n+    document.addEventListener(\'composerFiltered\', function(e){\n+      try{\n+        var filtered = e && e.detail && e.detail.filtered ? e.detail.filtered : [];\n+        try{ window.latestFiltered = filtered; }catch(_){ }\n+        var ev = new CustomEvent(\'filtersChanged\', { detail: { filtered: filtered } });\n+        document.dispatchEvent(ev);\n+      }catch(err){ console.warn(\'filters bridge failed\', err); }\n+    }, { passive: true });\n+  <\/script>';
    return header;
  }

  function createFooter(){
    var footer = document.createElement('div'); footer.id='fixed-footer'; footer.setAttribute('role','contentinfo'); footer.style.zIndex='1200'; footer.style.background='#8b0000'; footer.style.color='#fff'; footer.innerHTML = '\n+  <div class="fixed-footer-inner">\n+    <div class="footer-left">\n+      <div class="title">Archive of Soviet Trumpet Music</div>\n+      <div class="subtitle">Архив советской трубной музыки</div>\n+    </div>\n+    <div class="fixed-footer-center">\n+      <div class="links">\n+        <a href="/about">About</a>\n+        <a href="#">Contact</a>\n+        <a href="/composers">Composers</a>\n+      </div>\n+    </div>\n+    <div class="fixed-footer-right">\n+      <div class="copyright">© 2025 Archive of Soviet Trumpet Music</div>\n+    </div>\n+  </div>';
    return footer;
  }

  function mount(){
    if (!shouldInject()) return;

    try{
      if (!document.getElementById('site-desktop-header')){
        var h = createHeader(); h.id = 'site-desktop-header'; document.body.insertBefore(h, document.body.firstChild);
      }
      if (!document.getElementById('site-desktop-footer')){
        var f = createFooter(); f.id='site-desktop-footer'; document.body.appendChild(f);
      }
      // Expose bridge listener for composerFiltered (keeps parity)
      document.addEventListener('composerFiltered', function(e){ try{ var filtered = e && e.detail && e.detail.filtered ? e.detail.filtered : []; try{ window.latestFiltered = filtered; }catch(_){ } var ev = new CustomEvent('filtersChanged', { detail: { filtered: filtered } }); document.dispatchEvent(ev); }catch(err){} }, { passive: true });

      // Attach mobile header hamburger behavior (open/close right-side menu)
      (function(){
        var btn = document.getElementById('headerHamburger');
        function lockBody(){ try{ document.documentElement.style.overflow = 'hidden'; document.body.style.overflow = 'hidden'; }catch(_){ } }
        function unlockBody(){ try{ document.documentElement.style.overflow = ''; document.body.style.overflow = ''; }catch(_){ } }
        function openMenu(){
          try{ if (window.__mobileOverlayLock) return; }catch(_){ }
          try{ if (document.getElementById('mobile-menu-overlay')) return; }catch(_){ }
          var overlay = document.createElement('div'); overlay.id = 'mobile-menu-overlay'; overlay.className = 'mobile-overlay right'; overlay.setAttribute('aria-hidden','false');
          var inner = document.createElement('div'); inner.className = 'overlay-inner'; inner.setAttribute('role','menu');
          var close = document.createElement('button'); close.className = 'overlay-close'; close.textContent = 'Close'; close.addEventListener('click', closeMenu);
          inner.appendChild(close);
          var list = document.createElement('div'); list.style.padding = '16px'; list.style.display = 'flex'; list.style.flexDirection = 'column'; list.style.gap = '12px';
          function link(href, text){ var a = document.createElement('a'); a.href=href; a.textContent=text; a.style.display='inline-block'; a.style.padding='10px 12px'; a.style.borderRadius='8px'; a.style.background='#fff'; a.style.color='var(--accent)'; a.style.textDecoration='none'; return a; }
          list.appendChild(link('/', 'Home'));
          list.appendChild(link('/about', 'About'));
          list.appendChild(link('/sources', 'Sources'));
          inner.appendChild(list);
          try{ overlay.style.position = 'fixed'; overlay.style.inset = '0'; overlay.style.zIndex = '100000'; overlay.style.background = 'rgba(0,0,0,0.18)'; overlay.style.pointerEvents = 'auto'; }catch(_){ }
          try{ inner.style.position = 'absolute'; inner.style.top = '64px'; inner.style.bottom = '56px'; inner.style.right = '0'; inner.style.width = '84vw'; inner.style.maxWidth = '360px'; inner.style.background = 'white'; inner.style.boxShadow = ' -6px 0 18px rgba(0,0,0,0.12)'; inner.style.borderRadius = '12px 0 0 12px'; inner.style.overflow = 'auto'; inner.style.padding = '8px'; inner.style.boxSizing = 'border-box'; inner.style.zIndex = '100001'; }catch(_){ }
          overlay.appendChild(inner); document.body.appendChild(overlay);
          try{ window.__mobileOverlayLock = 'menu'; }catch(_){ }
          try{ var _s = window.scrollY || document.documentElement.scrollTop || 0; overlay.__savedScrollY = _s; document.body.style.position = 'fixed'; document.body.style.top = '-' + _s + 'px'; document.body.style.left = '0'; document.body.style.right = '0'; document.body.style.width = '100%'; lockBody(); }catch(_){ }
          overlay.addEventListener('click', function(e){ if (e.target === overlay) closeMenu(); });
        }
        function closeMenu(){ var ov = document.getElementById('mobile-menu-overlay'); if (!ov) return; try{ var saved = ov.__savedScrollY || 0; ov.remove(); try{ if (window.__mobileOverlayLock === 'menu') window.__mobileOverlayLock = null; }catch(_){ } try{ document.body.style.position = ''; document.body.style.top = ''; document.body.style.left = ''; document.body.style.right = ''; document.body.style.width = ''; unlockBody(); if (saved) window.scrollTo(0, saved); }catch(_){ } }catch(e){ try{ ov.remove(); }catch(_){ } }
        }
        try{ if (btn) btn.addEventListener('click', function(e){ e && e.preventDefault && e.preventDefault(); openMenu(); }); }catch(_){ }
      })();
    }catch(e){ console.error('desktop-chrome mount failed', e); }
  }

  function onResize(){ try{ if (shouldInject()){ if (!document.getElementById('site-desktop-header')) mount(); } else { var h = document.getElementById('site-desktop-header'); if (h) h.remove(); var f = document.getElementById('site-desktop-footer'); if (f) f.remove(); } }catch(_){ } }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  window.addEventListener('resize', onResize);
})();