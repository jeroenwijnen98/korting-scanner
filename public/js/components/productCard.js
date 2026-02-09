export function createProductCard(product, { onRemove, showBonus = false }) {
  const el = document.createElement('div');
  el.className = 'product-card';

  // Header: title + remove button
  const header = document.createElement('div');
  header.className = 'product-card-header';

  const titleEl = document.createElement('div');
  titleEl.className = 'product-card-title';
  titleEl.textContent = product.title;
  header.appendChild(titleEl);

  if (onRemove) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-ghost btn-sm';
    removeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    removeBtn.addEventListener('click', () => onRemove(product));
    header.appendChild(removeBtn);
  }

  el.appendChild(header);

  // Meta: size, brand, store badge
  const meta = document.createElement('div');
  meta.className = 'product-card-meta';
  const store = product.store || '';
  const storeBadge = `<span class="badge-store badge-store-${store}">${store.toUpperCase()}</span>`;
  const parts = [product.salesUnitSize, product.brand].filter(Boolean);
  meta.innerHTML = `${storeBadge} ${parts.join(' · ')}`;
  el.appendChild(meta);

  // Bonus info (only in bonus view)
  if (showBonus && product.isBonus) {
    const bonusRow = document.createElement('div');
    bonusRow.className = 'product-card-bonus';

    if (product.bonusMechanism) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-bonus';
      badge.textContent = product.bonusMechanism;
      bonusRow.appendChild(badge);
    }

    const prices = document.createElement('div');
    prices.className = 'product-card-prices';
    if (product.currentPrice != null) {
      const curr = document.createElement('span');
      curr.className = 'price-current';
      curr.textContent = formatPrice(product.currentPrice);
      prices.appendChild(curr);
    }
    if (product.priceBeforeBonus != null && product.priceBeforeBonus !== product.currentPrice) {
      const before = document.createElement('span');
      before.className = 'price-before';
      before.textContent = formatPrice(product.priceBeforeBonus);
      prices.appendChild(before);
    }
    bonusRow.appendChild(prices);
    el.appendChild(bonusRow);

    if (product.bonusEndDate) {
      const dates = document.createElement('div');
      dates.className = 'product-card-dates';
      dates.textContent = `t/m ${formatDate(product.bonusEndDate)}`;
      el.appendChild(dates);
    }
  }

  return el;
}

function formatPrice(price) {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(price);
}

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return dateStr;
  }
}
