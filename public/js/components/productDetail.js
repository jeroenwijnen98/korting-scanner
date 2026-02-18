import { parseUnitSize, calcPricePerUnit } from '../utils/unitPrice.js';

export function createProductDetail(product, { onBack, showBonus = false, history = [] }) {
  const el = document.createElement('div');
  el.className = 'product-detail';

  // Back button
  const backBtn = document.createElement('button');
  backBtn.className = 'product-detail-back';
  backBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"></line>
      <polyline points="12 19 5 12 12 5"></polyline>
    </svg>
    Terug
  `;
  backBtn.addEventListener('click', onBack);
  el.appendChild(backBtn);

  // Title
  const title = document.createElement('h2');
  title.className = 'product-detail-title';
  title.textContent = product.title;
  el.appendChild(title);

  // Meta: store badge, brand, size
  const meta = document.createElement('div');
  meta.className = 'product-detail-meta';
  const store = product.store || '';
  const storeBadge = `<span class="badge-store badge-store-${store}">${store.toUpperCase()}</span>`;
  const parts = [product.brand, product.salesUnitSize].filter(Boolean);
  meta.innerHTML = `${storeBadge} ${parts.join(' &middot; ')}`;
  el.appendChild(meta);

  // Bonus info
  if (showBonus && product.isBonus) {
    const bonusSection = document.createElement('div');
    bonusSection.className = 'product-detail-bonus';

    if (product.bonusMechanism) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-bonus';
      badge.textContent = product.bonusMechanism;
      bonusSection.appendChild(badge);
    }

    const prices = document.createElement('div');
    prices.className = 'product-detail-prices';
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
    bonusSection.appendChild(prices);
    el.appendChild(bonusSection);

    if (product.bonusEndDate) {
      const dates = document.createElement('div');
      dates.className = 'product-detail-dates';
      dates.textContent = `t/m ${formatDate(product.bonusEndDate)}`;
      el.appendChild(dates);
    }
  }

  // Unit prices section
  const { volume, unit } = parseUnitSize(product.salesUnitSize);
  const unitSection = document.createElement('div');
  unitSection.className = 'product-detail-unit-prices';

  const unitTitle = document.createElement('div');
  unitTitle.className = 'product-detail-unit-title';
  unitTitle.textContent = 'Prijs per eenheid';
  unitSection.appendChild(unitTitle);

  if (showBonus && product.isBonus && product.currentPrice != null) {
    const bonusUnit = calcPricePerUnit(product.currentPrice, volume, unit);
    if (bonusUnit) {
      const row = document.createElement('div');
      row.className = 'unit-price-row unit-price-bonus';
      row.innerHTML = `<span class="unit-price-label">Bonusprijs</span><span class="unit-price-value">${formatPrice(bonusUnit.unitPrice)} / ${bonusUnit.standardUnit}</span>`;
      unitSection.appendChild(row);
    }

    if (product.priceBeforeBonus != null && product.priceBeforeBonus !== product.currentPrice) {
      const normalUnit = calcPricePerUnit(product.priceBeforeBonus, volume, unit);
      if (normalUnit) {
        const row = document.createElement('div');
        row.className = 'unit-price-row unit-price-normal';
        row.innerHTML = `<span class="unit-price-label">Normaal</span><span class="unit-price-value strikethrough">${formatPrice(normalUnit.unitPrice)} / ${normalUnit.standardUnit}</span>`;
        unitSection.appendChild(row);
      }
    }
  } else {
    // Not on bonus — show regular unit price
    const price = product.currentPrice ?? product.priceBeforeBonus;
    const unitInfo = calcPricePerUnit(price, volume, unit);
    if (unitInfo) {
      const row = document.createElement('div');
      row.className = 'unit-price-row';
      row.innerHTML = `<span class="unit-price-label">Prijs</span><span class="unit-price-value">${formatPrice(unitInfo.unitPrice)} / ${unitInfo.standardUnit}</span>`;
      unitSection.appendChild(row);
    }
  }

  // Only append if we have unit price rows (beyond the title)
  if (unitSection.children.length > 1) {
    el.appendChild(unitSection);
  }

  // Price history section
  if (history.length > 0) {
    const histSection = document.createElement('div');
    histSection.className = 'product-detail-history';

    const histTitle = document.createElement('div');
    histTitle.className = 'product-detail-unit-title';
    histTitle.textContent = 'Prijsgeschiedenis';
    histSection.appendChild(histTitle);

    const table = document.createElement('table');
    table.className = 'history-table';
    table.innerHTML = `<thead><tr>
      <th>Datum</th><th>Prijs</th><th>Actie</th><th>Per eenheid</th><th>Normaal /eenheid</th>
    </tr></thead>`;
    const tbody = document.createElement('tbody');

    const { volume, unit: sizeUnit } = parseUnitSize(product.salesUnitSize);

    for (const entry of history) {
      const tr = document.createElement('tr');
      if (entry.isBonus) tr.className = 'history-row-bonus';

      const unitInfo = calcPricePerUnit(entry.currentPrice, volume, sizeUnit);
      const normalUnitInfo = calcPricePerUnit(entry.priceBeforeBonus, volume, sizeUnit);

      tr.innerHTML = `
        <td>${formatDate(entry.date)}</td>
        <td>${entry.currentPrice != null ? formatPrice(entry.currentPrice) : '-'}</td>
        <td>${entry.bonusMechanism || '-'}</td>
        <td>${unitInfo ? formatPrice(unitInfo.unitPrice) + ' / ' + unitInfo.standardUnit : '-'}</td>
        <td>${entry.isBonus && normalUnitInfo ? formatPrice(normalUnitInfo.unitPrice) + ' / ' + normalUnitInfo.standardUnit : '-'}</td>
      `;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    histSection.appendChild(table);
    el.appendChild(histSection);
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
