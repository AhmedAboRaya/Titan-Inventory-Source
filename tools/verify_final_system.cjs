const http = require('http');

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

async function run() {
  const base = 'http://127.0.0.1:19012/inventory/v1';
  const loginRes = await request(base + '/auth/login', { method: 'POST' }, {
    username: 'admin',
    password: 'TEST-only-password-4821'
  });
  const cookie = loginRes.headers['set-cookie'];
  const csrf = loginRes.body.csrf;
  const authHeaders = { 'Cookie': cookie, 'x-csrf-token': csrf };

  const allDocs = (await request(base + '/documents', { headers: authHeaders })).body || [];
  const issues = allDocs.filter(d => d.type === 'issue');
  const receipts = allDocs.filter(d => d.type === 'receipt');

  console.log('=== SYSTEM VERIFICATION SUMMARY ===');
  console.log('Total documents visible in list:', allDocs.length);
  console.log('Total issues:', issues.length);
  console.log('Total receipts:', receipts.length);
  console.log('First issue document:', issues[issues.length - 1].number, issues[issues.length - 1].reason, issues[issues.length - 1].document_date);
  console.log('Last issue document:', issues[0].number, issues[0].reason, issues[0].document_date);

  const balances = (await request(base + '/reports/balances', { headers: authHeaders })).body || [];
  console.log('\nTotal active stock positions:', balances.length);
  
  // Sample stock balances
  const testSkus = [
    'HA37%-PIO', 'HA37%POWER', 'Alkaline D F', 'VIAL11841', 'TIG50600',
    'ET100%', 'BR5.6000', 'SA98%', 'ADP', 'SBB1007',
    'IFU', 'PB1510', 'OVERBEAR-41', 'OVERHEAD-39', 'BASICCARTONS-01'
  ];
  console.log('\nKey Sample Balances:');
  for (const s of testSkus) {
    const list = balances.filter(b => (b.sku || '').toLowerCase() === s.toLowerCase());
    const total = list.reduce((sum, b) => sum + Number(b.quantity), 0);
    console.log(`- ${s.padEnd(16)}: ${total} ${list[0]?.base_unit || ''} (${list.length} positions)`);
  }
}

run().catch(console.error);
