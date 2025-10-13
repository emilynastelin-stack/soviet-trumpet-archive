import React, { useState, useEffect, useMemo } from 'react';

// Props:
// - composers: full list of composer objects (normalized by mount)
// - onFiltered: optional callback to pass the filtered list back to parent
function ComposerFilter({ composers = [], onFiltered }) {
  const [search, setSearch] = useState('');
  const [selectedCountries, setSelectedCountries] = useState([]);
  const [selectedRepublics, setSelectedRepublics] = useState([]);
  const [selectedDecades, setSelectedDecades] = useState([]);
  const [selectedGenders, setSelectedGenders] = useState([]);
  const [selectedTypes, setSelectedTypes] = useState([]);

  const list = Array.isArray(composers) ? composers : [];

  // Helper to safely read raw fields from normalized composer.__raw
  const readRaw = (c, keys) => {
    if (!c || !c.__raw) return '';
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(c.__raw, k) && c.__raw[k]) return c.__raw[k];
    }
    return '';
  };

  // Compute unique lists for each filter from available data
  const allCountries = useMemo(() => Array.from(new Set(list.map(c => (c && c.country) || '').filter(Boolean))).sort(), [list]);

  const allRepublics = useMemo(() => {
    const vals = list.map(c => String(readRaw(c, ['Soviet Republic', 'Soviet republic', 'Republic', 'Region', 'Republic/Region', 'Республика', 'Soviet']).valueOf ? readRaw(c, ['Soviet Republic', 'Soviet republic', 'Republic', 'Region']) : readRaw(c, ['Soviet Republic', 'Soviet republic', 'Republic', 'Region'])) || '').filter(Boolean);
    return Array.from(new Set(vals)).sort();
  }, [list]);

  const allDecades = useMemo(() => {
    const vals = list.map(c => {
      const d = readRaw(c, ['Decade', 'decade']);
      if (d) return String(d);
      const year = readRaw(c, ['Year', 'year']);
      const y = parseInt(year, 10);
      if (Number.isFinite(y) && y > 1800) return `${Math.floor(y/10)*10}s`;
      return '';
    }).filter(Boolean);
    return Array.from(new Set(vals)).sort();
  }, [list]);

  const allGenders = useMemo(() => {
    const vals = list.map(c => String(readRaw(c, ['Gender', 'gender']) || '')).filter(Boolean);
    return Array.from(new Set(vals)).sort();
  }, [list]);

  const allTypes = useMemo(() => {
    const vals = list.map(c => String(readRaw(c, ['Type', 'type']) || '')).filter(Boolean);
    return Array.from(new Set(vals)).sort();
  }, [list]);

  // computeFiltered uses all selected filters
  const computeFiltered = () => {
    const q = (search || '').toLowerCase();
    return list.filter(c => {
      const name = (c && (c.name || c.fullName || c.title || c.Composer)) || '';
      const country = (c && c.country) || '';
      const republic = String(readRaw(c, ['Soviet Republic', 'Soviet republic', 'Republic', 'Region']) || '');
      const decade = String(readRaw(c, ['Decade', 'decade']) || (() => {
        const y = parseInt(readRaw(c, ['Year', 'year']), 10);
        return (Number.isFinite(y) && y > 1800) ? `${Math.floor(y/10)*10}s` : '';
      })());
      const gender = String(readRaw(c, ['Gender', 'gender']) || '');
      const type = String(readRaw(c, ['Type', 'type']) || '');

      const matchesSearch = !q || name.toLowerCase().includes(q) || country.toLowerCase().includes(q) || republic.toLowerCase().includes(q) || type.toLowerCase().includes(q);

      const any = (sel, val) => !sel || sel.length === 0 || sel.includes(val);

      return matchesSearch && any(selectedCountries, country) && any(selectedRepublics, republic) && any(selectedDecades, decade) && any(selectedGenders, gender) && any(selectedTypes, type);
    });
  };

  useEffect(() => {
    const filtered = computeFiltered();
    try { if (typeof onFiltered === 'function') onFiltered(filtered); } catch (e) { console.warn(e); }
    try { window.latestFiltered = filtered; } catch (e) { /* ignore */ }
    try { document.dispatchEvent(new CustomEvent('composerFiltered', { detail: { filtered } })); } catch (e) { /* ignore */ }
  }, [search, selectedCountries, selectedRepublics, selectedDecades, selectedGenders, selectedTypes, composers]);

  // Toggle helpers
  const toggle = (value, setter) => {
    setter(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));
  };

  const selectAll = (group) => {
    if (group === 'country') setSelectedCountries(allCountries.slice());
    if (group === 'republic') setSelectedRepublics(allRepublics.slice());
    if (group === 'decade') setSelectedDecades(allDecades.slice());
    if (group === 'gender') setSelectedGenders(allGenders.slice());
    if (group === 'type') setSelectedTypes(allTypes.slice());
  };
  const clearAll = (group) => {
    if (group === 'country') setSelectedCountries([]);
    if (group === 'republic') setSelectedRepublics([]);
    if (group === 'decade') setSelectedDecades([]);
    if (group === 'gender') setSelectedGenders([]);
    if (group === 'type') setSelectedTypes([]);
  };

  return (
    <div className="composer-filter">
      <input
        type="text"
        id="qinput"
        placeholder="Search composers..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="search-input"
      />

      <div className="filter-box">
        {/* COUNTRY */}
        <div className="filter-group" data-group="country">
          <div className="filter-header">
            <h4>Country</h4>
            <div className="filter-actions"></div>
          </div>
          <div className="filter-options" id="filter-country">
            {allCountries.map(c => (
              <label key={c}><input type="checkbox" name="country" value={c} data-val={c} checked={selectedCountries.includes(c)} onChange={() => toggle(c, setSelectedCountries)} /> {c}</label>
            ))}
            <label><input type="checkbox" name="country" value="Other" data-val="Other" checked={selectedCountries.includes('Other')} onChange={() => toggle('Other', setSelectedCountries)} /> Other</label>
          </div>
          <div className="filter-actions">
            <button type="button" className="small-action select-all" onClick={() => selectAll('country')}>Select all</button>
            <button type="button" className="small-action clear-all" onClick={() => clearAll('country')}>Clear all</button>
          </div>
        </div>

        {/* REPUBLIC */}
        <div className="filter-group" data-group="republic">
          <div className="filter-header">
            <h4>Soviet Republic</h4>
            <div className="filter-actions"></div>
          </div>
          <div className="filter-options" id="filter-republic">
            {allRepublics.map(r => (
              <label key={r}><input type="checkbox" name="republic" value={r} data-val={r} checked={selectedRepublics.includes(r)} onChange={() => toggle(r, setSelectedRepublics)} /> {r}</label>
            ))}
            <label><input type="checkbox" name="republic" value="Other" data-val="Other" checked={selectedRepublics.includes('Other')} onChange={() => toggle('Other', setSelectedRepublics)} /> Other</label>
          </div>
          <div className="filter-actions">
            <button type="button" className="small-action select-all" onClick={() => selectAll('republic')}>Select all</button>
            <button type="button" className="small-action clear-all" onClick={() => clearAll('republic')}>Clear all</button>
          </div>
        </div>

        {/* DECADE */}
        <div className="filter-group" data-group="decade">
          <div className="filter-header">
            <h4>Decade</h4>
            <div className="filter-actions"></div>
          </div>
          <div className="filter-options" id="filter-decade">
            {allDecades.map(d => (
              <label key={d}><input type="checkbox" name="decade" value={d} data-val={d} checked={selectedDecades.includes(d)} onChange={() => toggle(d, setSelectedDecades)} /> {d}</label>
            ))}
          </div>
          <div className="filter-actions">
            <button type="button" className="small-action select-all" onClick={() => selectAll('decade')}>Select all</button>
            <button type="button" className="small-action clear-all" onClick={() => clearAll('decade')}>Clear all</button>
          </div>
        </div>

        {/* GENDER */}
        <div className="filter-group" data-group="gender">
          <div className="filter-header">
            <h4>Gender</h4>
            <div className="filter-actions"></div>
          </div>
          <div className="filter-options" id="filter-gender">
            {['Male','Female','Other'].map(g => (
              <label key={g}><input type="checkbox" name="gender" value={g} data-val={g} checked={selectedGenders.includes(g)} onChange={() => toggle(g, setSelectedGenders)} /> {g}</label>
            ))}
          </div>
          <div className="filter-actions">
            <button type="button" className="small-action select-all" onClick={() => selectAll('gender')}>Select all</button>
            <button type="button" className="small-action clear-all" onClick={() => clearAll('gender')}>Clear all</button>
          </div>
        </div>

        {/* TYPE */}
        <div className="filter-group" data-group="type">
          <div className="filter-header">
            <h4>Type of Piece</h4>
            <div className="filter-actions"></div>
          </div>
          <div className="filter-options" id="filter-type">
            {allTypes.map(t => (
              <label key={t}><input type="checkbox" name="type" value={t} data-val={t} checked={selectedTypes.includes(t)} onChange={() => toggle(t, setSelectedTypes)} /> {t}</label>
            ))}
          </div>
          <div className="filter-actions">
            <button type="button" className="small-action select-all" onClick={() => selectAll('type')}>Select all</button>
            <button type="button" className="small-action clear-all" onClick={() => clearAll('type')}>Clear all</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComposerFilter;
export { ComposerFilter };
