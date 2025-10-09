// Inline example script moved out of the Astro page to avoid SSR parsing issues.
(function(){
  // Example data
  const results = [
    { title: "Concert scherzo", composer: "Abramyan, Eduard Aslanovich", published: 1957 },
    { title: "Sonata", composer: "Asafiev, Boris Vladimirovich", published: 1950 },
    { title: "Scherzo", composer: "Tchaikovsky, Pyotr", published: 1880 },
    { title: "Symphony No.1", composer: "Shostakovich, Dmitri", published: 1926 }
  ];

  const resultsPerPage = 2;
  let currentPage = 1;

  const resultsList = document.getElementById("results-list");
  const pagination = document.getElementById("pagination");

  function renderResults() {
    if (!resultsList) return;
    resultsList.innerHTML = "";

    const start = (currentPage - 1) * resultsPerPage;
    const end = start + resultsPerPage;
    const pageResults = results.slice(start, end);

    pageResults.forEach(item => {
      const card = document.createElement("div");
      card.className = "result-card";

      const main = document.createElement("div");
      main.className = "result-main";
      main.innerHTML = `
        Results<br>
        ${item.title}<br>
        Composer: ${item.composer}<br>
        Published: ${item.published}
      `;

      const right = document.createElement("div");
      right.className = "result-right";

      const viewLink = document.createElement("a");
      viewLink.href = "#";
      viewLink.textContent = "View";

      const moreBtn = document.createElement("button");
      moreBtn.className = "more-composer-btn";
      moreBtn.textContent = "More from this composer";
      moreBtn.onclick = () => filterByComposer(item.composer);

      right.appendChild(viewLink);
      right.appendChild(moreBtn);

      card.appendChild(main);
      card.appendChild(right);

      resultsList.appendChild(card);
    });
  }

  function renderPagination() {
    if (!pagination) return;
    pagination.innerHTML = "";

    const totalPages = Math.ceil(results.length / resultsPerPage);

    const prevBtn = document.createElement("button");
    prevBtn.className = "page-btn page-arrow";
    prevBtn.innerHTML = "&lt;";
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => { currentPage--; update(); };
    pagination.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i++) {
      const pageBtn = document.createElement("button");
      pageBtn.className = "page-btn";
      pageBtn.textContent = i;
      if (i === currentPage) pageBtn.setAttribute("aria-current", "true");
      pageBtn.onclick = () => { currentPage = i; update(); };
      pagination.appendChild(pageBtn);
    }

    const nextBtn = document.createElement("button");
    nextBtn.className = "page-btn page-arrow";
    nextBtn.innerHTML = "&gt;";
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => { currentPage++; update(); };
    pagination.appendChild(nextBtn);
  }

  function update() {
    renderResults();
    renderPagination();
  }

  function filterByComposer(composerName) {
    console.log("Filter by composer:", composerName);
  }

  // Initial render
  document.addEventListener('DOMContentLoaded', update);
})();
