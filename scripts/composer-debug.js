const puppeteer = require('puppeteer');

(async function(){
  const browser = await puppeteer.launch({args: ['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  await page.goto('http://localhost:4321/composers/', { waitUntil: 'networkidle2' });
  // find the first details/about button and click it
  const btn = await page.$('button.about-badge');
  if (!btn) { console.log('NO about-badge BUTTON FOUND'); await browser.close(); process.exit(2); }
  await btn.click();
  // wait for the React panel to appear
  await page.waitForSelector('[aria-label^="Composer details"]', { timeout: 5000 }).catch(()=>{});
  // capture which element has #composer-content
  const result = await page.evaluate(()=>{
    const composerContent = document.querySelector('#composer-content');
    const overlays = Array.from(document.querySelectorAll('.mobile-overlay.right, #panel-right-mobile-clone, #panel-right'));
    const overlayStyles = overlays.map(el=>({ selector: el.id || el.className, display: getComputedStyle(el).display, bg: getComputedStyle(el).backgroundColor, html: el.innerHTML && el.innerHTML.slice(0,200) }));
    return {
      composerContentExists: !!composerContent,
      composerContentBg: composerContent ? getComputedStyle(composerContent).backgroundColor : null,
      composerContentHtmlSnippet: composerContent ? composerContent.innerHTML.slice(0,200) : null,
      overlays: overlayStyles,
      panelBg: (function(){ const p = document.querySelector('[aria-label^="Composer details"]'); return p ? getComputedStyle(p).backgroundColor : null })()
    };
  });
  console.log('RESULT:', JSON.stringify(result, null, 2));
  await browser.close();
  process.exit(0);
})();