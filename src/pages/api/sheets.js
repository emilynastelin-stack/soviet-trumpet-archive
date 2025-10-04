import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';

const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID || '1UiK8QDq98C-9wCpQjdQAVpSdH8mZkpxYgMMEHM3uaGk';
const DEFAULT_SHEET_RANGE = process.env.SHEETS_RANGE || 'Sheet1!A1:O1000';

function fixMojibake(s) {
  if (!s || typeof s !== 'string') return s;
  // Common mojibake patterns include sequences with Ã or Ð characters when UTF-8 is mis-decoded.
  if (/[ÃÐ]/.test(s)) {
    try {
      // interpret the string as latin1 (iso-8859-1) bytes and decode as utf8
      const buf = Buffer.from(s, 'latin1');
      const decoded = buf.toString('utf8');
      // If decoded looks more sensible (more ASCII letters), prefer it
      const sensible = (decoded.replace(/[^\p{L}\p{N}]/gu, '').length > s.replace(/[^\p{L}\p{N}]/gu, '').length);
      return sensible ? decoded : s;
    } catch (e) {
      return s;
    }
  }
  return s;
}

async function parseRowsToJson(values) {
  const rows = Array.isArray(values) ? values.map(r => Array.isArray(r) ? r : []) : [];
  if (rows.length === 0) return [];
  const rawHeaders = rows.shift().map(h => (h === null || h === undefined) ? '' : String(h).trim());
  const headers = rawHeaders.map((h, i) => {
    let hh = h || '';
    hh = fixMojibake(hh).trim();
    if (!hh) {
      // Fallback stable header name
      hh = `col_${i}`;
    }
    return hh;
  });
  return rows.map(row => {
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = (row && row[i] !== undefined && row[i] !== null) ? row[i] : '';
    }
    return obj;
  });
}

export async function GET(request) {
  // Allow callers to specify a sheet name (e.g. ?sheet=Sheet2) or a full range (e.g. ?range=Sheet2!A1:Z100)
  const url = request && request.url ? new URL(request.url) : null;
  const q = url ? url.searchParams : null;
  const sheetName = q && q.get('sheet');
  const overrideRange = q && q.get('range');
  const range = overrideRange || (sheetName ? `${sheetName}!A1:Z1000` : DEFAULT_SHEET_RANGE);

  const serviceAccountEnv = process.env.SERVICE_ACCOUNT_JSON;
  if (serviceAccountEnv) {
    try {
      const creds = JSON.parse(serviceAccountEnv);
      const auth = new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
      const sheets = google.sheets({ version: 'v4', auth });
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      const data = await parseRowsToJson(res.data.values || []);
      return new Response(JSON.stringify(data, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
      console.error('Service-account (env) fetch failed:', err && err.message ? err.message : err);
      // fall through to try file-based approach or API key
    }
  }

  try {
    const keyPath = path.resolve('./secrets/service-account.json');
    if (fs.existsSync(keyPath)) {
      const auth = new google.auth.GoogleAuth({
        keyFile: keyPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
      const sheets = google.sheets({ version: 'v4', auth });
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      const data = await parseRowsToJson(res.data.values || []);
      return new Response(JSON.stringify(data, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (err) {
    console.error('Service-account fetch failed:', err && err.message ? err.message : err);
  }

  // Fallback: if a public sheet and an API key is provided via env, use REST endpoint
  const apiKey = process.env.GOOGLE_API_KEY || process.env.NPM_CONFIG_GOOGLE_API_KEY;
  if (apiKey) {
    try {
      const urlStr = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;
      const res = await fetch(urlStr);
      if (!res.ok) {
        const txt = await res.text();
        return new Response(JSON.stringify({ error: 'Google API fetch failed', status: res.status, body: txt }), { status: 502, headers: { 'Content-Type': 'application/json' } });
      }
      const json = await res.json();
      const data = await parseRowsToJson(json.values || []);
      return new Response(JSON.stringify(data, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Failed to fetch via API key', message: String(err) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
  }

  return new Response(JSON.stringify({ error: 'Missing credentials', message: 'Place a service account JSON at ./secrets/service-account.json or set GOOGLE_API_KEY in environment for a public sheet.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}
