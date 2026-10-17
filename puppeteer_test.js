import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));

  await page.goto('http://localhost:5174', { waitUntil: 'networkidle2' });
  
  // Wait a few seconds to let three.js and URDFLoader try loading
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const rootHtml = await page.evaluate(() => document.body.innerHTML);
  if (rootHtml.includes('URDF')) {
     console.log('Found URDF in HTML:', rootHtml.substring(0, 1000));
  }

  await browser.close();
})();
