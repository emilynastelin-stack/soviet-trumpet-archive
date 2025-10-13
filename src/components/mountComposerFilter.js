import React from 'react';
import { createRoot } from 'react-dom/client';
import ComposerFilterIsland from './ComposerFilterIsland.jsx';

function normalizeRow(row){
  // Best-effort mapping from sheet row to composer shape expected by the component
  if (!row || typeof row !== 'object') return null;
  return {
    name: row.name || row.fullName || row['Composer'] || row['composer'] || '',
    // Accept many possible spreadsheet column names for the republic/country
    country: row['country'] || row['Country'] || row['nation'] || row['location'] || row['Soviet Republic'] || row['Soviet republic'] || row['Republic'] || row['Region'] || '',
    // keep original row for downstream needs
    __raw: row
  };
}

export default function mount(rootEl, rows, options){
  try{
    if (!rootEl) return;
    const composers = Array.isArray(rows) ? rows.map(normalizeRow).filter(Boolean) : [];
    // If headless, keep the mount node hidden so the visible page markup is unchanged
    if (options && options.headless){
      try{ rootEl.style.display = 'none'; }catch(_){ }
    }
  const root = createRoot(rootEl);
  root.render(React.createElement(ComposerFilterIsland, { composers: composers }));
    return root;
  }catch(e){ console.error('mountComposerFilter failed', e); }
}

// expose helper on window for inline scripts to call
try{ if (typeof window !== 'undefined') window.__mountComposerFilter = window.__mountComposerFilter || mount; }catch(e){}
