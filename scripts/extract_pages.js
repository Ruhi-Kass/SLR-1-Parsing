import fs from 'fs';
import pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

(async () => {
  try {
    const data = new Uint8Array(fs.readFileSync('./Chapter_3_updated_HiLCoE (6).pdf'));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const start = 42;
    const end = 64;
    const out = [];
    for (let i = start; i <= Math.min(end, doc.numPages); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const strs = content.items.map(it => it.str).join(' ');
      out.push(`=== PAGE ${i} ===\n${strs}\n`);
    }
    console.log(out.join('\n'));
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
