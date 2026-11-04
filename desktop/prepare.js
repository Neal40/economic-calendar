// Copies ../index.html into app/ and swaps Google Fonts for bundled local fonts (offline).
const fs=require("fs"),path=require("path");
const src=process.argv[2]||path.join(__dirname,"..","index.html");
const F=[["Space Grotesk","space-grotesk",[400,500,600,700]],["Space Mono","space-mono",[400,700]],["Caveat","caveat",[500,600]]];
fs.mkdirSync("app/fonts",{recursive:true});
let css="";
for(const [fam,id,ws] of F) for(const w of ws){
  const f=`${id}-latin-${w}-normal.woff2`;
  fs.copyFileSync(`node_modules/@fontsource/${id}/files/${f}`,`app/fonts/${f}`);
  css+=`@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};font-display:swap;src:url(fonts/${f}) format('woff2')}\n`;
}
let h=fs.readFileSync(src,"utf8");
h=h.replace(/<link rel="preconnect"[^>]*>\n?/,"").replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/,`<style>\n${css}</style>`);
fs.writeFileSync("app/index.html",h);
fs.copyFileSync("build/icon.png","app/icon.png");
console.log("app/ ready");
