import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';

const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID || '1UiK8QDq98C-9wCpQjdQAVpSdH8mZkpxYgMMEHM3uaGk';
// By default fetch enough of the sheet to include columns A–O and many rows.
// Override with SHEETS_RANGE env var (e.g. "Sheet1!A1:O317") if desired.
// To include additional columns, set SHEETS_RANGE in your environment (or change the default here).
const range = process.env.SHEETS_RANGE || 'Sheet1!A1:O1000';

async function parseRowsToJson(rows) {
  const rr = rows || [];
  const headers = rr.shift() || [];
  return rr.map(row => Object.fromEntries(row.map((v, i) => [headers[i], v || ''])));
}

export async function GET() {
  // If a service account JSON is provided via env (useful on Vercel), try it first.
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
  // Try service account file first (local secrets/service-account.json)
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
    // fall through to try API key approach
    console.error('Service-account fetch failed:', err && err.message ? err.message : err);
  }

  // Fallback: if a public sheet and an API key is provided via env, use REST endpoint
  const apiKey = process.env.GOOGLE_API_KEY || process.env.NPM_CONFIG_GOOGLE_API_KEY;
  if (apiKey) {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;
      const res = await fetch(url);
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

  // If neither approach worked, return a clear error for the developer
  return new Response(JSON.stringify({ error: 'Missing credentials', message: 'Place a service account JSON at ./secrets/service-account.json or set GOOGLE_API_KEY in environment for a public sheet.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}
