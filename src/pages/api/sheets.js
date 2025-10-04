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

function jsonResponse(obj, status = 200, sheetRange = ''){
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (sheetRange) headers['X-Sheet-Range'] = String(sheetRange);
  return new Response(JSON.stringify(obj, null, 2), { status, headers });
}

export async function GET(request) {
  // Allow callers to specify a sheet name (e.g. ?sheet=Sheet2) or a full range (e.g. ?range=Sheet2!A1:Z100)
  const url = request && request.url ? new URL(request.url) : null;
  const q = url ? url.searchParams : null;
  const sheetName = q && q.get('sheet');
  const overrideRange = q && q.get('range');
  const primaryRange = overrideRange || (sheetName ? `${sheetName}!A1:Z1000` : DEFAULT_SHEET_RANGE);
  // If callers didn't provide a sheet explicitly and DEFAULT_SHEET_RANGE references 'Sheet1',
  // try a small set of likely renamed tabs (e.g. MusicList) to be tolerant of renames.
  const candidateRanges = [];
  if (overrideRange) candidateRanges.push(overrideRange);
  else if (sheetName) candidateRanges.push(`${sheetName}!A1:Z1000`);
  // always include the primary range as first preference
  if (!candidateRanges.includes(primaryRange)) candidateRanges.push(primaryRange);
  // additional fallbacks when default references a legacy name
  if (!sheetName && String(primaryRange).includes('Sheet1')){
    candidateRanges.push('MusicList!A1:Z1000');
    candidateRanges.push('MusicList!A1:O1000');
    candidateRanges.push('CompDet!A1:Z1000');
  }

  const serviceAccountEnv = process.env.SERVICE_ACCOUNT_JSON;
  if (serviceAccountEnv) {
    // Accept either raw JSON in the env var or a base64-encoded JSON string (some deploy UIs require base64)
    let parsed = null;
    try {
      try {
        parsed = JSON.parse(serviceAccountEnv);
      } catch (errRaw) {
        // try base64 decode then parse
        try {
          const decoded = Buffer.from(serviceAccountEnv, 'base64').toString('utf8');
          parsed = JSON.parse(decoded);
        } catch (errB64) {
          // return a helpful error so caller/browser can diagnose env formatting issues
          return jsonResponse({ error: 'SERVICE_ACCOUNT_JSON_PARSE_ERROR', message: 'SERVICE_ACCOUNT_JSON is present but could not be parsed as JSON (raw or base64). Please ensure the env var contains valid JSON or base64-encoded JSON.' }, 500, '');
        }
      }

      // If parsed successfully, attempt to use it
      try {
        const creds = parsed;
        const auth = new google.auth.GoogleAuth({
          credentials: creds,
          scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        // try candidate ranges in order until one succeeds
        let lastErr = null;
        for (const rng of candidateRanges){
          try{
            const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: rng });
            const data = await parseRowsToJson(res.data.values || []);
            return jsonResponse(data, 200, rng);
          }catch(errRange){ lastErr = errRange; /* try next */ }
        }
        // if none succeeded, return last error message
        return jsonResponse({ error: 'SERVICE_ACCOUNT_AUTH_ERROR', message: String(lastErr && lastErr.message ? lastErr.message : lastErr) }, 502, '');
      } catch (errAuth) {
        // Surface auth errors to the caller to help debugging (message only, no secrets)
        return jsonResponse({ error: 'SERVICE_ACCOUNT_AUTH_ERROR', message: String(errAuth && errAuth.message ? errAuth.message : errAuth) }, 502, '');
      }
    } catch (e) {
      // Unexpected - fall through to other methods
      console.error('Service-account (env) unexpected error:', e && e.message ? e.message : e);
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
      let lastErr = null;
        for (const rng of candidateRanges){
        try{
          const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: rng });
          const data = await parseRowsToJson(res.data.values || []);
          return jsonResponse(data, 200, rng);
        }catch(errRange){ lastErr = errRange; }
      }
      return jsonResponse({ error: 'SERVICE_ACCOUNT_AUTH_ERROR', message: String(lastErr && lastErr.message ? lastErr.message : lastErr) }, 502, '');
    }
  } catch (err) {
    console.error('Service-account fetch failed:', err && err.message ? err.message : err);
  }

  // Fallback: if a public sheet and an API key is provided via env, use REST endpoint
  const apiKey = process.env.GOOGLE_API_KEY || process.env.NPM_CONFIG_GOOGLE_API_KEY;
  if (apiKey) {
    try {
      const urlStr = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(primaryRange)}?key=${apiKey}`;
      const res = await fetch(urlStr);
      if (!res.ok) {
        const txt = await res.text();
        return jsonResponse({ error: 'Google API fetch failed', status: res.status, body: txt }, 502, primaryRange);
      }
      const json = await res.json();
      const data = await parseRowsToJson(json.values || []);
      return jsonResponse(data, 200, primaryRange);
    } catch (err) {
      return jsonResponse({ error: 'Failed to fetch via API key', message: String(err) }, 502, primaryRange);
    }
  }

  // Final fallback: try the public Google 'gviz' endpoint which works for publicly shared sheets.
  // This does not require credentials but only works if the spreadsheet/tab is shared publicly.
  try {
    // derive a sheet name for the gviz call: prefer explicit sheetName if provided, otherwise extract from DEFAULT_SHEET_RANGE
    const sheetParam = sheetName || (DEFAULT_SHEET_RANGE && DEFAULT_SHEET_RANGE.split('!')[0]) || 'Sheet1';
    // use a reasonable range part (A1:Z1000) for gviz
    const rangePart = 'A1:Z1000';
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetParam)}&range=${encodeURIComponent(rangePart)}`;
    const gresp = await fetch(gvizUrl);
    if (gresp && gresp.ok){
      const text = await gresp.text();
      // response wraps JSON in google.visualization.Query.setResponse(...)
      const m = text.match(/google\.visualization\.Query\.setResponse\((.*)\);?/s);
      const json = m && m[1] ? JSON.parse(m[1]) : null;
      if (json && json.table){
        const cols = (json.table.cols || []).map(c => (c && (c.label || c.id)) ? String(c.label || c.id) : '');
        const rows = (json.table.rows || []).map(r => (r.c || []).map(cell => (cell && cell.v !== undefined && cell.v !== null) ? cell.v : ''));
        // build values array with header row first
        const values = [cols, ...rows];
  const data = await parseRowsToJson(values || []);
  return jsonResponse(data, 200, sheetParam + '!A1:Z1000');
      }
    }
  } catch (err) {
    console.error('GViz fallback fetch failed:', err && err.message ? err.message : err);
  }

  return jsonResponse({ error: 'Missing credentials', message: 'Place a service account JSON at ./secrets/service-account.json or set GOOGLE_API_KEY in environment for a public sheet.' }, 500, '');
}
