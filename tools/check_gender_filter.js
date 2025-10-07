const fs = require('fs');
function normalize(s){ if(!s) return ''; try{ return s.toString().normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase(); }catch(e){ return s.toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); } }
function run(){
  const raw = JSON.parse(fs.readFileSync('./tmp_sheets.json','utf8'));
  const rows = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.rows) ? raw.rows : raw);
  console.log('rows length:', rows ? rows.length : 0);
  const checkedGenders = ['Male'];
  const checkedNorm = checkedGenders.map(s=>normalize(s));
  let matched = 0; let sample = [];
  rows.forEach((r, idx)=>{
    let rawG = '';
    if (Array.isArray(r)){
      rawG = r[7] != null ? String(r[7]) : '';
    } else if (r && typeof r === 'object'){
      rawG = (r.Gender || r.gender || r['Gender'] || r['gender'] || r['Column H'] || r['H'] || r['col_8'] || '');
    }
    const parts = String(rawG || '').split(/[;,\/|]+/).map(s=> normalize(s)).filter(Boolean);
    const matchesG = checkedNorm.some(nsel => parts.some(p => p && (p.includes(nsel) || nsel.includes(p))));
    if (matchesG){ matched++; if (sample.length<5) sample.push({idx, rawG, parts, composer: r.Composer || r['Composer']}); }
  });
  console.log('matched with Male:', matched);
  console.log('sample matches:', sample);
}
run();
