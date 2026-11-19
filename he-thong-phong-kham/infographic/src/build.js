// Thay [[ten-icon]] bằng SVG Lucide inline, xuất ra file .build.html rồi chụp PNG
const fs=require('fs'),path=require('path');
const ICON_DIR=process.env.ICON_DIR;
const {chromium}=require('playwright');
const [src,out,scale]=process.argv.slice(2);
let html=fs.readFileSync(src,'utf8');const miss=new Set();
html=html.replace(/\[\[([a-z0-9-]+)\]\]/g,(m,n)=>{const f=path.join(ICON_DIR,n+'.svg');
  if(!fs.existsSync(f)){miss.add(n);return '';}
  return fs.readFileSync(f,'utf8').replace(/<!--[\s\S]*?-->/g,'').replace(/<svg[^>]*>/,m=>m.replace(/\s(width|height|class)="[^"]*"/g,'').replace('<svg','<svg class="ic"')).trim();});
if(miss.size){console.error('THIẾU ICON:',[...miss].join(', '));}
const tmp=src.replace(/\.html$/,'.build.html');fs.writeFileSync(tmp,html);
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1800,height:400},deviceScaleFactor:+scale||1});
await p.goto('file://'+path.resolve(tmp));await p.waitForTimeout(300);await p.screenshot({path:out,fullPage:true});await b.close();fs.unlinkSync(tmp);})();
