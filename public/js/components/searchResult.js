export function createSearchResult(product, { onAdd, isSaved }) {
  const el = document.createElement('div');
  el.className = 'search-result';

  // Optional thumbnail on the left
  if (product.imageUrl) {
    const img = document.createElement('img');
    img.className = 'search-result-image';
    img.src = product.imageUrl;
    img.alt = '';
    img.loading = 'lazy';
    el.appendChild(img);
  }

  const info = document.createElement('div');
  info.className = 'search-result-info';

  const title = document.createElement('div');
  title.className = 'search-result-title';
  title.textContent = product.title;
  info.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'search-result-meta';
  const parts = [product.salesUnitSize, product.brand].filter(Boolean);
  meta.textContent = parts.join(' · ');
  info.appendChild(meta);

  if (product.isBonus && product.bonusMechanism) {
    const bonus = document.createElement('div');
    bonus.className = 'search-result-bonus';
    bonus.textContent = product.bonusMechanism;
    info.appendChild(bonus);
  }

  el.appendChild(info);

  if (isSaved) {
    const check = document.createElement('span');
    check.style.cssText = 'color: var(--success); font-size: 1.25rem;';
    check.textContent = '\u2713';
    el.appendChild(check);
  } else {
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary btn-sm';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', () => onAdd(product));
    el.appendChild(addBtn);
  }

  return el;
}
