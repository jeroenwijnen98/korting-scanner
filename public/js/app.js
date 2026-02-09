import { initOnSale } from './views/onSale.js';
import { initMyProducts } from './views/myProducts.js';

// Tab switching
const tabBtns = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.tab-panel');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    tabBtns.forEach(b => b.classList.toggle('active', b === btn));
    panels.forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
  });
});

// Refresh button
document.getElementById('refresh-btn').addEventListener('click', () => {
  initOnSale();
});

// Init views
initOnSale();
initMyProducts();
