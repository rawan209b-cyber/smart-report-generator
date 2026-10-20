const fs=require('fs');
const path=require('path');
const puppeteer=require('puppeteer-core');
const {themeOf,escapeHtml,imageData,safeArray}=require('./common');

function findChrome(){
  const roots=[process.env.CHROME_PATH,process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA||'','Google','Chrome','Application','chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/chromium','/usr/bin/google-chrome'];
  const found=roots.find(p=>p&&fs.existsSync(p));
  if(!found)throw new Error('لم يتم العثور على Chrome. ثبتي Chrome أو حددي CHROME_PATH في .env');
  return found;
}
function htmlForReport(report,options={}){
  const t=themeOf(options.theme),e=escapeHtml;
  const info=safeArray(report.basicInfo).map(x=>`<div class="info"><b>${e(x.label)}</b><span>${e(x.value)}</span></div>`).join('');
  const sections=safeArray(report.sections).map((s,i)=>`<section><h2>${String(i+1).padStart(2,'0')} — ${e(s.title)}</h2>${safeArray(s.paragraphs).map(p=>`<p>${e(p)}</p>`).join('')}${s.points?.length?`<ul>${s.points.map(p=>`<li>${e(p)}</li>`).join('')}</ul>`:''}</section>`).join('');
  const images=safeArray(options.images).map((img,i)=>`<figure><img src="${imageData(img)}" alt="صورة مرفقة ${i+1}"><figcaption>صورة مرفقة ${i+1}</figcaption></figure>`).join('');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:19mm 17mm 18mm}*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;color:#253141;direction:rtl;line-height:1.85;font-size:12px}
    .cover{min-height:220mm;display:flex;flex-direction:column;justify-content:center;border-right:13px solid #${t.primary};padding:30px 35px;background:#${t.light};break-after:page}
    .eyebrow{color:#${t.accent};font-size:14px;font-weight:bold}.cover h1{font-size:33px;color:#${t.primary};line-height:1.5}.subtitle{font-size:18px;color:#475569}
    h2{color:#${t.primary};border-bottom:2px solid #${t.accent};padding-bottom:8px;font-size:19px;break-after:avoid}
    h3{color:#${t.primary};font-size:16px;break-after:avoid}section{margin:22px 0}p{margin:10px 0;text-align:right;white-space:pre-wrap;overflow-wrap:anywhere}
    li{margin:6px 0;break-inside:avoid}ul{padding-right:23px}.info{padding:10px 12px;border-bottom:1px solid #ddd;display:flex;gap:20px;break-inside:avoid}.info b{min-width:110px;color:#${t.primary}}
    figure{margin:14px 0;text-align:center;break-inside:avoid}figure img{max-width:100%;max-height:120mm;object-fit:contain}figcaption{color:#667085;font-size:10px}
    .intro,.ending{background:#${t.light};border-right:4px solid #${t.accent};padding:13px 18px;break-inside:avoid}img{display:block;margin:auto}
    </style></head><body><div class="cover"><div class="eyebrow">SMART REPORT</div><h1>${e(report.title)}</h1><div class="subtitle">${e(report.subtitle)}</div></div>
    ${info?`<section><h2>البيانات الأساسية</h2>${info}</section>`:''}
    ${report.introduction?`<section><h2>مقدمة</h2><div class="intro"><p>${e(report.introduction)}</p></div></section>`:''}
    ${sections}${images?`<section><h2>الصور المرفقة</h2>${images}</section>`:''}
    ${report.nextSteps?.length?`<section><h2>الخطوات القادمة</h2><ul>${report.nextSteps.map(p=>`<li>${e(p)}</li>`).join('')}</ul></section>`:''}
    ${report.conclusion?`<section><h2>الخاتمة</h2><div class="ending"><p>${e(report.conclusion)}</p></div></section>`:''}</body></html>`;
}

async function createPdfReport(report, options = {}) {
    const browser = await puppeteer.launch({
        executablePath: findChrome(),
        headless: true,
        args: ['--disable-dev-shm-usage'],
        timeout: 30000
    });

    try {
        const page = await browser.newPage();

        // Prevent the PDF browser from accessing external resources.
        await page.setRequestInterception(true);

        page.on('request', request => {
            const url = request.url();

            if (url.startsWith('data:') || url === 'about:blank') {
                request.continue();
            } else {
                request.abort();
            }
        });

        await page.setJavaScriptEnabled(false);

        await page.setContent(
            htmlForReport(report, options),
            { waitUntil: 'load', timeout: 30000 }
        );

        await page.evaluate(() => document.fonts.ready);

        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: '<span></span>',
            footerTemplate: `
                <div style="font:9px Arial;width:100%;text-align:center;color:#777">
                    <span class="pageNumber"></span> /
                    <span class="totalPages"></span>
                </div>
            `,
            margin: {
                top: '19mm',
                right: '17mm',
                bottom: '18mm',
                left: '17mm'
            },
            timeout: 30000
        });

        return Buffer.from(pdf);
    } finally {
        await browser.close();
    }
}
