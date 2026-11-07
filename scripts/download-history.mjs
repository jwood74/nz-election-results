import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { historicalDownloads, fetchHistoricalCsv, validateHistoricalCsv, sha256 } from '../lib/history.mjs';

const root = new URL('../data/2023/raw/', import.meta.url);
await mkdir(root, { recursive: true });
const manifestUrl = new URL('downloads.json', root);
let manifest;
try { manifest = JSON.parse(await readFile(manifestUrl, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; manifest = { files: [] }; }
try {
  for (const entry of historicalDownloads()) {
    const target = new URL(entry.filename, root);
    let bytes;
    let method = 'existing-local-file';
    try { bytes = await readFile(target); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      bytes = await fetchHistoricalCsv(entry.url);
      method = 'direct-download';
      // Never overwrite a downloaded or user-provided original.
      await writeFile(target, bytes, { flag: 'wx' });
    }
    validateHistoricalCsv(bytes);
    const existing = manifest.files.find(f => f.filename === entry.filename);
    const hash = sha256(bytes);
    if (existing && existing.sha256 !== hash) throw new Error(`Saved source checksum changed: ${entry.filename}`);
    if (!existing) {
      manifest.files.push({ ...entry, sha256: hash, bytes: bytes.length, recordedAt: new Date().toISOString(), method });
      await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    console.log(`Saved/cached ${entry.filename}`);
  }
} catch (error) {
  console.error(`Historical download stopped: ${error.message}\nNo blocked response was saved as a CSV. Place manually downloaded originals in data/2023/raw/ and rerun; cached files are not downloaded again.`);
  process.exitCode = 1;
}
