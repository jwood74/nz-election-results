import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseXml, list } from '../lib/feed.mjs';
import { sha256 } from '../lib/history.mjs';

const root=new URL('../data/booth-matching/source/',import.meta.url), target=new URL('current-votingplaces.xml',root);
await mkdir(root,{recursive:true});
try {
  await readFile(target);
  console.log('Current metadata snapshot already exists; use the saved snapshot for a reproducible audit.');
} catch(error) {
  if(error.code!=='ENOENT')throw error;
  const url='https://media.election.net.nz/xml/votingplaces.xml';
  const response=await fetch(url,{headers:{Accept:'application/xml'},signal:AbortSignal.timeout(20_000)});
  if(!response.ok)throw new Error(`Metadata source returned HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer()), places=list(parseXml(bytes.toString('utf8')).votingplaces?.votingplace);
  if(!places.length || places.some(p=>!p.vp_id || !p.vp_address))throw new Error('Unexpected metadata; refusing to save source response');
  await writeFile(target,bytes,{flag:'wx'});
  await writeFile(new URL('provenance.json',root),`${JSON.stringify({url,fetchedAt:new Date().toISOString(),lastModified:response.headers.get('last-modified'),bytes:bytes.length,sha256:sha256(bytes),places:places.length},null,2)}\n`,{flag:'wx'});
  console.log(`Saved ${places.length} polling-place metadata records, no result-file crawl.`);
}
