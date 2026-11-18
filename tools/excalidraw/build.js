// Construit vendor/excalidraw/ : excalidraw.js (IIFE, React inclus → window.ICTExcalidraw), excalidraw.css, fonts/ (sans Xiaolai/CJK : chargée depuis le CDN d'Excalidraw si besoin), LICENSE.
// Usage : cd tools/excalidraw && npm ci && npm run build
const fs = require("fs"), path = require("path"), esbuild = require("esbuild");
const pkg = path.join(__dirname, "node_modules/@excalidraw/excalidraw");
const out = path.join(__dirname, "../../vendor/excalidraw");
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
esbuild.buildSync({
  entryPoints: [path.join(__dirname, "entry.js")], bundle: true, minify: true, format: "iife", target: "es2020",
  outfile: path.join(out, "excalidraw.js"), logLevel: "warning", legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"', "import.meta.env": '{"MODE":"production","PROD":true,"DEV":false}' },
});
fs.copyFileSync(path.join(pkg, "dist/prod/index.css"), path.join(out, "excalidraw.css"));
fs.cpSync(path.join(pkg, "dist/prod/fonts"), path.join(out, "fonts"), { recursive: true, filter: (s) => !/[\\/]Xiaolai([\\/]|$)/.test(s) });
const v = require(path.join(pkg, "package.json")).version;
fs.writeFileSync(path.join(out, "LICENSE"), `Excalidraw ${v} — https://github.com/excalidraw/excalidraw\n\nMIT License\n\nCopyright (c) 2020 Excalidraw\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n`);
fs.writeFileSync(path.join(out, "version.json"), JSON.stringify({ excalidraw: v, react: require(path.join(__dirname, "node_modules/react/package.json")).version }));
console.log("vendor/excalidraw prêt (Excalidraw " + v + ")");
