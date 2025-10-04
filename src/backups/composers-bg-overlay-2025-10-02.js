// Backup of background overlay script from src/pages/composers.astro
// Saved: 2025-10-02
// To restore: copy the IIFE below back into src/pages/composers.astro where the bg-overlay script lives.

(function(){
  // Image natural dimensions and the focal point in image coordinates
  const IMG_W = 1920, IMG_H = 1080;
  const FOCUS_X = 955, FOCUS_Y = 325;
  const img = document.getElementById('bg-img');
  const overlay = document.getElementById('bg-overlay');
  if (!img || !overlay) return;

  let _pending = false;
  function applyFocus(){
    if (_pending) return;
    _pending = true;
    requestAnimationFrame(()=>{
      try{
        const vw = Math.max(window.innerWidth || document.documentElement.clientWidth, 0);
        const vh = Math.max(window.innerHeight || document.documentElement.clientHeight, 0);
        // cover scale
        const scale = Math.max(vw / IMG_W, vh / IMG_H);
        const scaledW = IMG_W * scale;
        const scaledH = IMG_H * scale;

        // size the image element to the scaled size
        img.style.width = Math.round(scaledW) + 'px';
        img.style.height = Math.round(scaledH) + 'px';

        // scaled coordinates of the focus point
        const fx = FOCUS_X * scale;
        const fy = FOCUS_Y * scale;

        // compute center of the mast image in viewport coordinates
        const mastEl = document.querySelector('.mast img') || document.querySelector('.mast');
        let mastCenterX = vw / 2;
        let mastCenterY = vh / 2;
        if (mastEl) {
          const mRect = mastEl.getBoundingClientRect();
          // If mast hasn't been laid out yet, fallback to viewport center
          if (mRect.width > 0 && mRect.height > 0) {
            mastCenterX = mRect.left + (mRect.width / 2);
            mastCenterY = mRect.top + (mRect.height / 2);
          }
        }

        // place the background image so the scaled focus point aligns with mast center
        const left = mastCenterX - fx;
        const top = mastCenterY - fy;
        img.style.left = Math.round(left) + 'px';
        img.style.top = Math.round(top) + 'px';
      }catch(e){
        console.error('applyFocus error', e);
      }finally{
        _pending = false;
      }
    });
  }

  // re-run on resize and when image loads; also run on window load and when fonts/images settle
  img.addEventListener('load', applyFocus);
  window.addEventListener('resize', applyFocus);
  // Run once on window load to ensure layout is stable
  window.addEventListener('load', ()=>{ setTimeout(applyFocus, 80); });
  // If the page uses the Font Loading API, re-run when fonts are ready
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(()=> setTimeout(applyFocus, 60)).catch(()=>{});
  }
  // run shortly after load in case other layout shifts occur
  setTimeout(applyFocus, 250);
})();
