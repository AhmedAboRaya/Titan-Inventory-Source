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

  const lotsRes = await request(base + '/lots', { headers: authHeaders });
  const lots = lotsRes.body || [];
  console.log(`Total lots in Titan Inventory: ${lots.length}`);
  lots.slice(0, 15).forEach(l => {
    console.log(`lot_id=${l.id} item_id=${l.item_id} code="${l.code}" notes="${l.notes}"`);
  });

  const balancesRes = await request(base + '/reports/balances', { headers: authHeaders });
  const balances = balancesRes.body || [];
  console.log(`\nTotal balances in Titan Inventory: ${balances.length}`);
  balances.slice(0, 15).forEach(b => {
    console.log(`item=${b.item_sku} lot_id=${b.lot_id} lot_code=${b.lot_code} qty=${b.quantity} unit=${b.unit}`);
  });
}

run().catch(console.error);
