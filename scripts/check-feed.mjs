import { service } from '../lib/http.mjs';
try {
  const data = await service.national();
  console.log(JSON.stringify({ updated: data.updated, parties: data.parties.length, votes: data.votes }, null, 2));
} catch (error) {
  console.error(`Feed check failed: ${error.message}`);
  process.exitCode = 1;
}
