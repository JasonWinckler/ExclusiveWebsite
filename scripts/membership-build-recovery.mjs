// Bounded recovery of one failed Cloudflare CI build. Never print API payloads,
// environment bindings, raw build logs or credentials. This does not touch D1.
import {readFileSync,readdirSync} from 'node:fs';
const worker = 'exclusive-membership-api';
const failedBuild = '43b2a4cb-bfc0-4dee-9bbd-7d1166f8fe49';
const targetCommit = 'd8e7a921f90aa966c3ac9f7d3a429c576520a38f';
function assert(value, message) { if (!value) throw new Error(message); }
const tag = process.env.GITHUB_REF || '';
const match = /^refs\/tags\/exclusive-build-(inspect|retry)-([a-f0-9]{40})$/.exec(tag);
assert(process.env.GITHUB_ACTIONS === 'true' && match?.[2] === process.env.GITHUB_SHA, 'Exact reviewed Actions revision required.');
assert(/^[a-f0-9]{32}$/.test(process.env.CLOUDFLARE_ACCOUNT_ID || '') && process.env.CLOUDFLARE_API_TOKEN, 'Configured Cloudflare account/token required.');
async function api(path, body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, ...(body ? {'Content-Type':'application/json'} : {})},
    ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(()=>null);
  const codes = (payload?.errors || []).map(error=>error.code).filter(Number.isSafeInteger);
  assert(response.ok && payload?.success === true, `Cloudflare build API HTTP ${response.status}; numeric codes ${codes.join(',') || 'none'}; raw response withheld.`);
  return payload.result;
}
function safeBuild(build) {
  return {build: /^[a-f0-9-]{36}$/.test(build?.build_uuid || '') ? build.build_uuid : null,
    status: ['queued','initializing','running','stopped'].includes(build?.status) ? build.status : null,
    outcome: ['success','fail','skipped','cancelled','terminated'].includes(build?.build_outcome) ? build.build_outcome : null};
}
const build = await api(`/builds/builds/${failedBuild}`);
const scripts = await api('/workers/scripts');
const script = scripts.filter(item=>item.id === worker);
assert(script.length === 1 && typeof script[0].tag === 'string', 'Exact existing membership Worker not found.');
assert([worker,script[0].tag].includes(build?.trigger?.external_script_id), 'Build belongs to a different Worker.');
assert(build?.build_trigger_metadata?.commit_hash === targetCommit && build?.build_trigger_metadata?.branch === 'main', 'Build source is not the exact reviewed main commit.');
assert(/^[a-f0-9-]{36}$/.test(build?.trigger?.trigger_uuid || ''), 'Invalid exact build trigger.');
console.log(JSON.stringify({worker,commit:targetCommit,...safeBuild(build)}));
const diagnostics = new Set();
const knownTestFiles = readdirSync('cloudflare/test').filter(file=>file.endsWith('.test.ts'));
const knownTestTitles = knownTestFiles.flatMap(file => [...readFileSync(`cloudflare/test/${file}`,'utf8').matchAll(/\b(?:it|test)\(\s*"([^"\n]+)"/g)].map(item=>item[1]));
const testFailures = new Set();
const categories = [
  ['dependency_install', /failed to install|dependency installation|ERR_PNPM|ERESOLVE|EINTEGRITY/i],
  ['missing_module', /cannot find module|could not resolve|module not found/i],
  ['authentication', /authentication error|authentication failed|unauthorized|invalid api token/i],
  ['permission', /permission denied|insufficient permissions|not authorized/i],
  ['timeout', /timed out|timeout exceeded|deadline exceeded/i],
  ['network', /network error|fetch failed|connection reset|ECONNRESET|ETIMEDOUT|ENOTFOUND/i],
  ['deployment_conflict', /deployment.*in progress|conflict|version.*mismatch/i],
  ['rate_limit', /rate limit|too many requests/i],
  ['service_unavailable', /service unavailable|internal server error|upstream error/i],
  ['test_failure', /tests? failed|failed tests|test suite failed/i],
  ['build_failure', /build failed|failed to build|deploy command/i],
];
let cursor = '', lineCount = 0;
for (let page = 0; page < 10; page++) {
  const logs = await api(`/builds/builds/${failedBuild}/logs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
  const lines = Array.isArray(logs?.lines) ? logs.lines : [];
  lineCount += lines.length;
  for (const line of lines) {
    const text = typeof line?.[1] === 'string' ? line[1] : '';
    if (/FAIL|failed|\u00d7|\u274c|timed out|timeout/i.test(text)) {
      for (const name of knownTestFiles) if(text.includes(name)) testFailures.add(name);
      for (const title of knownTestTitles) if(text.includes(title)) testFailures.add(title);
    }
    for (const [label,pattern] of categories) if (pattern.test(text)) diagnostics.add(label);
    for (const item of text.matchAll(/\b(?:ERR_PNPM_[A-Z_]+|TS[0-9]{4}|ELIFECYCLE|EAI_AGAIN|SIGKILL)\b/g)) diagnostics.add(item[0]);
    for (const item of text.matchAll(/\[code:\s*([0-9]{1,9})\]/g)) diagnostics.add(`Cloudflare code ${item[1]}`);
  }
  if (!logs?.truncated || !logs.cursor || logs.cursor === cursor) break;
  cursor = logs.cursor;
}
console.log(JSON.stringify({logLinesInspected:lineCount,diagnostics:[...diagnostics].sort(),knownSourceTestFailures:[...testFailures].sort(),rawLogsWithheld:true}));
if (match[1] === 'retry') {
  assert(build.build_outcome === 'fail' && build.status === 'stopped', 'Only the reviewed failed/stopped build may be retried.');
  const retry = await api(`/builds/triggers/${build.trigger.trigger_uuid}/builds`, {branch:'main',commit_hash:targetCommit});
  assert(/^[a-f0-9-]{36}$/.test(retry?.build_uuid || ''), 'Retry response did not contain a valid build ID; do not repeat blindly.');
  assert(retry?.build_trigger_metadata?.commit_hash === targetCommit && retry?.build_trigger_metadata?.branch === 'main' &&
    [worker,script[0].tag].includes(retry?.trigger?.external_script_id), 'Retry source metadata did not verify the exact commit/Worker. Do not repeat; inspect the provider build status.');
  console.log(JSON.stringify({exactCommitRetryRequested:true,worker,commit:targetCommit,...safeBuild(retry)}));
} else console.log('Read-only inspection complete. No retry, deployment, database change or message requested.');
