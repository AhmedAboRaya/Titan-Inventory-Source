const http = require('http');
const crypto = require('crypto');

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqOptions = {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: { 'Origin': u.origin, ...options.headers }
    };
    if (body) {
      const data = typeof body === 'string' ? body : JSON.stringify(body);
      reqOptions.headers['Content-Type'] = 'application/json';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(reqOptions, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch (e) { parsed = raw; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const base = 'http://127.0.0.1:19012/inventory/v1';
  const loginRes = await request(base + '/auth/login', { method: 'POST' }, {
    username: 'admin',
    password: 'TEST-only-password-4821'
  });
  const cookie = loginRes.headers['set-cookie'];
  const csrf = loginRes.body.csrf;
  const authHeaders = { 'Cookie': cookie, 'x-csrf-token': csrf };

  // Find document #4 or any draft issue
  const docsRes = await request(base + '/documents?type=issue', { headers: authHeaders });
  const docs = docsRes.body || [];
  const draftDoc = docs.find(d => d.number === 4 || (d.status === 'Draft' && d.reason?.includes('استبعاد')));

  if (draftDoc) {
    console.log('Found draft document #' + draftDoc.number + ', submitting and posting...');
    const subRes = await request(base + '/documents/' + draftDoc.id + '/submit', {
      method: 'POST',
      headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
    }, { version: draftDoc.version });

    if (subRes.status === 200) {
      const postRes = await request(base + '/documents/' + draftDoc.id + '/post', {
        method: 'POST',
        headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
      }, { version: subRes.body.version });

      if (postRes.status === 200) {
        console.log('SUCCESS: Issue document #' + draftDoc.number + ' posted!');
      } else {
        console.error('Post failed:', postRes.body);
      }
    } else {
      console.error('Submit failed:', subRes.body);
    }
  }

  // Deactivate generic items
  const item1Res = await request(base + '/items/SUMMERUNIF-71', { headers: authHeaders });
  const item2Res = await request(base + '/items/TROUSERS-72', { headers: authHeaders });
  const item1 = item1Res.body;
  const item2 = item2Res.body;

  if (item1 && item1.active) {
    await request(base + '/items/' + item1.id, {
      method: 'POST',
      headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
    }, { ...item1, active: false });
    console.log('Deactivated SUMMERUNIF-71');
  }

  if (item2 && item2.active) {
    await request(base + '/items/' + item2.id, {
      method: 'POST',
      headers: { ...authHeaders, 'idempotency-key': crypto.randomUUID() }
    }, { ...item2, active: false });
    console.log('Deactivated TROUSERS-72');
  }

  console.log('Done!');
}

main().catch(console.error);
