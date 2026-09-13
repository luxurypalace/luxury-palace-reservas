// Cliente mínimo de Google Sheets vía JWT de service account.
// Sin dependencias npm (igual criterio que el sistema de Beats & Buns) —
// usa solo los módulos nativos de Node: crypto, https.
//
// Variables de entorno requeridas (configurar en Netlify):
//   GOOGLE_CLIENT_EMAIL   -> client_email del service account
//   GOOGLE_PRIVATE_KEY    -> private_key del service account (con \n literales;
//                            Netlify permite pegarlo tal cual, aquí se reemplazan)
//   SHEET_ID              -> ID del Google Sheet de Luxury Palace

const crypto = require('crypto');
const https = require('https');

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed;
        try {
          parsed = data ? JSON.parse(data) : {};
        } catch (e) {
          parsed = { raw: data };
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

let cachedToken = null; // { token, exp }

async function getAccessToken() {
  if (cachedToken && cachedToken.exp > Date.now() / 1000 + 30) {
    return cachedToken.token;
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new Error('Faltan GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY en el entorno');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${unsigned}.${signature}`;

  const bodyStr = `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`;

  const resp = await httpsRequest(
    {
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    },
    bodyStr
  );

  cachedToken = { token: resp.access_token, exp: now + (resp.expires_in || 3600) };
  return cachedToken.token;
}

async function sheetsRequest(method, path, body) {
  const token = await getAccessToken();
  const bodyStr = body ? JSON.stringify(body) : undefined;
  return httpsRequest(
    {
      hostname: 'sheets.googleapis.com',
      path,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    },
    bodyStr
  );
}

const SHEET_ID = process.env.SHEET_ID;

async function readRange(range) {
  const resp = await sheetsRequest('GET', `/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`);
  return resp.values || [];
}

async function appendRow(range, values) {
  return sheetsRequest(
    'POST',
    `/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { values: [values] }
  );
}

async function updateRange(range, values) {
  return sheetsRequest(
    'PUT',
    `/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { values }
  );
}

module.exports = { readRange, appendRow, updateRange };
