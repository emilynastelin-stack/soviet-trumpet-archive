const puppeteer = require('puppeteer');

async function probe(path){
  const browser = await puppeteer.launch({args: ['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  const url = `http://localhost:4321${path}`;
  console.log('VISITING', url);
  await page.goto(url, { waitUntil: 'networkidle2' });
  const foundBtn = await page.$('button.about-badge');
  if (!foundBtn) {
    console.log('NO about-badge BUTTON FOUND on', path);
  } else {
    console.log('FOUND about-badge on', path, '— clicking');
    await foundBtn.click();
  }
  await page.waitForTimeout(600);
  const result = await page.evaluate(()=>{
    const composerContent = document.querySelector('#composer-content');
    const composerPanel = document.querySelector('[aria-label^="Composer details"]');
    const overlays = Array.from(document.querySelectorAll('.mobile-overlay.right, #panel-right-mobile-clone, #panel-right'));
    return {
      composerContentExists: !!composerContent,
      composerContentBg: composerContent ? getComputedStyle(composerContent).backgroundColor : null,
      composerContentHtmlSnippet: composerContent ? composerContent.innerHTML.slice(0,200) : null,
      panelBg: composerPanel ? getComputedStyle(composerPanel).backgroundColor : null,
      overlays: overlays.map(el=>({ sel: el.id || el.className, display: getComputedStyle(el).display, bg: getComputedStyle(el).backgroundColor }))
    };
  });
  console.log('PROBE RESULT for', path, JSON.stringify(result, null, 2));
  await browser.close();
}

(async function(){
  await probe('/composers/');
  await probe('/composers-results/');
  process.exit(0);
})();
