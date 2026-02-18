const fs = require('fs');
const path = require('path');

function main() {
  const root = path.resolve(__dirname, '..');
  const src = path.join(root, 'src', 'legacyExtension.js');
  const bootstrapSrc = path.join(root, 'extension.js');
  const outDir = path.join(root, 'dist');
  const dst = path.join(outDir, 'legacyExtension.js');

  if (!fs.existsSync(src)) {
    if (fs.existsSync(bootstrapSrc)) {
      fs.mkdirSync(path.dirname(src), { recursive: true });
      fs.copyFileSync(bootstrapSrc, src);
    } else {
      throw new Error(`Missing legacy source: ${src}`);
    }
  }

  fs.mkdirSync(outDir, { recursive: true });

  let text = fs.readFileSync(src, 'utf8');

  text = text.replace(/require\((['"])\.\/dist\//g, 'require($1./');

  fs.writeFileSync(dst, text, 'utf8');
}

main();
