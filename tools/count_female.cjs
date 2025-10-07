const fs = require('fs');
function normalize(s){ if(!s) return ''; try{ return s.toString().normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase(); }catch(e){ return s.toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); } }
function canonicalGender(s){ const n = normalize(s||''); if (!n) return ''; if (n==='f' || n==='female') return 'female'; if (n==='m' || n==='male') return 'male'; if (/\bfemale\b/.test(n)) return 'female'; if (/\bmale\b/.test(n)) return 'male'; return n; }
const raw = JSON.parse(fs.readFileSync('./tmp_sheets.json','utf8'));
const rows = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.rows) ? raw.rows : raw);
let matched = 0; let samples=[];
rows.forEach((r,idx)=>{
  let rawG='';
  if (Array.isArray(r)) rawG = r[7] != null ? String(r[7]) : '';
  else if (r && typeof r === 'object') rawG = (r.Gender || r.gender || r['Gender'] || r['gender'] || r['Column H'] || r['H'] || r['col_8'] || '');
  const parts = String(rawG||'').split(/[;,\/|]+/).map(s=>canonicalGender(s)).filter(Boolean);
  const matches = parts.some(p=> p && p === 'female');
  if (matches){ matched++; if (samples.length<6) samples.push({idx, rawG, parts, composer: r.Composer || r['Composer']}); }
});
console.log('female matched:', matched);
console.log('samples:', samples);
