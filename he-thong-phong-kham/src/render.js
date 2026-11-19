const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const scale=+process.argv[4]||1;
const p=await b.newPage({viewport:{width:1800,height:1000},deviceScaleFactor:scale});
await p.goto('file://'+process.argv[2]);await p.waitForTimeout(300);
await p.screenshot({path:process.argv[3],fullPage:true});await b.close();})();
