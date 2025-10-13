import React, { useEffect, useState } from 'react';
import ComposerFilter from './ComposerFilter.jsx';

export default function ComposerFilterIsland(props){
  const [composers, setComposers] = useState(props.composers || []);

  useEffect(() => {
    function onComposersLoaded(e){
      if (e && e.detail && Array.isArray(e.detail.composers)) setComposers(e.detail.composers);
    }
    window.addEventListener('composersLoaded', onComposersLoaded);
    return () => window.removeEventListener('composersLoaded', onComposersLoaded);
  }, []);

  function handleFiltered(filtered){
    try{ window.dispatchEvent(new CustomEvent('composerFiltered', { detail: { filtered } })); }catch(_){ }
  }

  return (
    <div className="composer-filter-island" aria-hidden={false}>
      <ComposerFilter composers={composers} onFiltered={handleFiltered} />
    </div>
  );
}
