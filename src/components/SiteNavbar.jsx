import React from 'react';

export default function SiteNavbar(props){
  const {
    composersList = [],
    countriesList = [],
    genderList = [],
    decadeList = [],
    typeList = [],
    selectedComposer, setSelectedComposer,
    selectedCountry, setSelectedCountry,
    genderFilter, setGenderFilter,
    decadeFilter, setDecadeFilter,
    typeFilter, setTypeFilter,
    query, setQuery,
    onSearch, onShowAll
  } = props || {};

  return (
    <nav className="site-navbar" style={{padding:12,borderBottom:'1px solid #eee'}}>
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        <select value={selectedComposer || ''} onChange={e=>setSelectedComposer && setSelectedComposer(e.target.value)}>
          <option value="">All Composers</option>
          {composersList.map((c,i)=>(<option key={i} value={c}>{c}</option>))}
        </select>

        <select value={selectedCountry || 'All'} onChange={e=>setSelectedCountry && setSelectedCountry(e.target.value)}>
          {countriesList.map((c,i)=>(<option key={i} value={c}>{c}</option>))}
        </select>

        <select value={genderFilter || 'Any'} onChange={e=>setGenderFilter && setGenderFilter(e.target.value)}>
          {genderList.map((g,i)=>(<option key={i} value={g}>{g}</option>))}
        </select>

        <select value={decadeFilter || 'All'} onChange={e=>setDecadeFilter && setDecadeFilter(e.target.value)}>
          {decadeList.map((d,i)=>(<option key={i} value={d}>{d}</option>))}
        </select>

  <input id="q" name="q" type="search" style={{flex:1,minWidth:200}} value={query || ''} onChange={e=>setQuery && setQuery(e.target.value)} placeholder="Search" />
        <button onClick={()=>onSearch && onSearch()}>{'Search'}</button>
        <button onClick={()=>onShowAll && onShowAll()}>{'Show All'}</button>
      </div>
    </nav>
  );
}
