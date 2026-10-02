// @ts-nocheck
// PROTOTYPE — throwaway. Not production code.
// Question: how should paused saved products move to a "Gepauzeerd" section at
// the bottom of Mijn Producten, especially for a product group that is only
// partly paused?
// Four variants on the existing Mijn Producten tab, switched with ?variant=A..D
// and the floating bar (or ← →). Without ?variant the page is unchanged.
// Pausing here is in memory only: nothing is saved. One group is made mixed
// on load (fake) because the real data has no partly paused group.

import { createProductCard } from '../components/productCard.js';

const VARIANTS = {
  A: 'Groep 2x tonen',
  B: 'Groep heel, gedimd onderin',
  C: 'Groep heel, "+N gepauzeerd" regel',
  D: 'Platte lijst onderaan',
};
const KEYS = Object.keys(VARIANTS);

/** id -> paused, layered over the real saved products */
const overrides = new Map();
let demoSeeded = false;
let pausedOpen = false;
const openMixedRows = new Set();
let rerender = () => {};

export function prototypeVariant() {
  const v = new URLSearchParams(location.search).get('variant');
  return v && KEYS.includes(v.toUpperCase()) ? v.toUpperCase() : null;
}

/**
 * @param {HTMLElement} container
 * @param {object[]} filtered saved products the store filter shows
 * @param {object[]} all every saved product
 * @param {() => void} rerenderFn
 */
export function renderPausedPrototype(container, filtered, all, rerenderFn) {
  rerender = rerenderFn;
  injectStyles();
  mountSwitcher();
  seedMixedGroup(all);

  const products = filtered.map(withOverride);
  const allP = all.map(withOverride);
  container.innerHTML = '';
  ({ A: variantA, B: variantB, C: variantC, D: variantD })[prototypeVariant()](container, products, allP);
}

// ---------- variants ----------

// A: a mixed group shows twice: its active members above, its paused members
// under "Gepauzeerd" with the same group name.
function variantA(container, products, all) {
  const active = products.filter(p => !p.paused);
  const paused = products.filter(p => p.paused);
  renderGroups(container, active, g => groupButton(all, g, true));
  container.appendChild(pausedSection(paused.length, body => {
    renderGroups(body, paused, g => groupButton(all, g, false));
  }));
}

// B: a group with any active member stays above, whole; its paused members are
// dimmed at the bottom of it. Only fully paused groups go to "Gepauzeerd".
function variantB(container, products, all) {
  const { top, bottom } = splitByGroupState(products);
  renderGroups(container, sortActiveFirst(top), g => groupButton(all, g));
  container.appendChild(pausedSection(bottom.length, body => {
    renderGroups(body, bottom, g => groupButton(all, g));
  }));
}

// C: like B, but the paused members of a mixed group hide behind a
// "+N gepauzeerd" row inside the group.
function variantC(container, products, all) {
  const { top, bottom } = splitByGroupState(products);
  for (const [name, items] of grouped(top)) {
    const active = items.filter(p => !p.paused);
    const paused = items.filter(p => p.paused);
    const section = makeSection(name, active.length, name ? groupButton(all, name) : null, paused.length);
    const list = section.querySelector('.card-list');
    active.forEach(p => list.appendChild(card(p)));
    if (paused.length) {
      const key = name ?? '';
      const open = openMixedRows.has(key);
      const row = document.createElement('button');
      row.className = 'proto-mixed-row';
      row.textContent = `${open ? '▾' : '▸'} ${paused.length} gepauzeerd`;
      row.addEventListener('click', () => {
        open ? openMixedRows.delete(key) : openMixedRows.add(key);
        rerender();
      });
      list.appendChild(row);
      if (open) paused.forEach(p => list.appendChild(card(p)));
    }
    container.appendChild(section);
  }
  container.appendChild(pausedSection(bottom.length, body => {
    renderGroups(body, bottom, g => groupButton(all, g));
  }));
}

// D: active products grouped as now; paused products as one flat list at the
// bottom, the group name as a label on each card.
function variantD(container, products, all) {
  const active = products.filter(p => !p.paused);
  const paused = products.filter(p => p.paused)
    .sort((a, b) => (a.productGroup || '~').localeCompare(b.productGroup || '~'));
  renderGroups(container, active, g => groupButton(all, g, true));
  container.appendChild(pausedSection(paused.length, body => {
    const list = document.createElement('div');
    list.className = 'card-list';
    for (const p of paused) {
      const c = card(p);
      const label = document.createElement('div');
      label.className = 'proto-group-label';
      label.textContent = p.productGroup || 'Niet gecategoriseerd';
      c.querySelector('.product-card-content').prepend(label);
      list.appendChild(c);
    }
    body.appendChild(list);
  }));
}

// ---------- shared bits ----------

function withOverride(p) {
  return overrides.has(p.id) ? { ...p, paused: overrides.get(p.id) } : p;
}

function seedMixedGroup(all) {
  if (demoSeeded) return;
  demoSeeded = true;
  const counts = new Map();
  for (const p of all) {
    if (p.productGroup && !p.paused) counts.set(p.productGroup, (counts.get(p.productGroup) || 0) + 1);
  }
  const [group] = [...counts].sort((a, b) => b[1] - a[1])[0] || [];
  const first = all.find(p => p.productGroup === group && !p.paused);
  if (first) overrides.set(first.id, true);
}

function setPaused(ids, paused) {
  ids.forEach(id => overrides.set(id, paused));
  rerender();
}

function card(p) {
  return createProductCard(p, {
    isPaused: Boolean(p.paused),
    onTogglePause: x => setPaused([x.id], !x.paused),
  });
}

/** Groups in first-seen order; null key = "Niet gecategoriseerd", first. */
function grouped(products) {
  const map = new Map([[null, []]]);
  for (const p of products) {
    const k = p.productGroup || null;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p);
  }
  if (!map.get(null).length) map.delete(null);
  return map;
}

function renderGroups(container, products, makeAction) {
  for (const [name, items] of grouped(products)) {
    const section = makeSection(name, items.length, name ? makeAction(name) : null);
    const list = section.querySelector('.card-list');
    items.forEach(p => list.appendChild(card(p)));
    container.appendChild(section);
  }
}

function makeSection(name, count, action, pausedCount = 0) {
  const section = document.createElement('div');
  section.className = 'group-section';
  const header = document.createElement('div');
  header.className = 'group-section-header';
  const n = document.createElement('span');
  n.className = 'group-section-name';
  n.textContent = name || 'Niet gecategoriseerd';
  const c = document.createElement('span');
  c.className = 'group-section-count';
  c.textContent = `${count} product${count !== 1 ? 'en' : ''}${pausedCount ? ` · ${pausedCount} gepauzeerd` : ''}`;
  header.append(n, c);
  if (action) header.appendChild(action);
  const list = document.createElement('div');
  list.className = 'card-list';
  section.append(header, list);
  return section;
}

/** A group with any active member (in the filtered view) stays on top, whole. */
function splitByGroupState(products) {
  const activeGroups = new Set(products.filter(p => !p.paused).map(p => p.productGroup || null));
  const top = [];
  const bottom = [];
  for (const p of products) {
    const k = p.productGroup || null;
    // Uncategorised is not a real group: its paused products go down
    if (k === null ? !p.paused : activeGroups.has(k)) top.push(p);
    else bottom.push(p);
  }
  return { top, bottom };
}

function sortActiveFirst(products) {
  return [...products].sort((a, b) => Number(Boolean(a.paused)) - Number(Boolean(b.paused)));
}

/**
 * Group header button. `forcePause` true/false fixes the action for the
 * section it sits in (A, D); undefined takes it from all members (as now).
 */
function groupButton(all, group, forcePause) {
  const members = all.filter(p => p.productGroup === group);
  const pause = forcePause ?? members.some(p => !p.paused);
  const btn = document.createElement('button');
  btn.className = 'btn btn-ghost btn-sm group-section-pause';
  btn.textContent = pause ? 'Pauzeren' : 'Hervatten';
  btn.addEventListener('click', () => {
    setPaused(members.filter(p => Boolean(p.paused) !== pause).map(p => p.id), pause);
  });
  return btn;
}

function pausedSection(count, fill) {
  const wrap = document.createElement('details');
  wrap.className = 'proto-paused';
  wrap.open = pausedOpen;
  wrap.addEventListener('toggle', () => { pausedOpen = wrap.open; });
  const summary = document.createElement('summary');
  summary.innerHTML = `<span class="proto-chevron">▸</span> Gepauzeerd <span class="group-section-count">${count}</span>`;
  wrap.appendChild(summary);
  const body = document.createElement('div');
  body.className = 'proto-paused-body';
  if (count) fill(body);
  else body.innerHTML = '<p class="group-section-count">Niets gepauzeerd</p>';
  wrap.appendChild(body);
  return wrap;
}

// ---------- switcher ----------

function mountSwitcher() {
  if (document.getElementById('proto-switcher')) {
    updateSwitcherLabel();
    return;
  }
  const bar = document.createElement('div');
  bar.id = 'proto-switcher';
  bar.innerHTML = `<button data-d="-1">←</button><span></span><button data-d="1">→</button>`;
  bar.querySelectorAll('button').forEach(b => b.addEventListener('click', () => cycle(Number(b.dataset.d))));
  document.body.appendChild(bar);
  document.addEventListener('keydown', e => {
    const t = e.target;
    if (t instanceof HTMLElement && (t.matches('input, textarea') || t.isContentEditable)) return;
    if (e.key === 'ArrowLeft') cycle(-1);
    if (e.key === 'ArrowRight') cycle(1);
  });
  updateSwitcherLabel();
}

function cycle(d) {
  const i = KEYS.indexOf(prototypeVariant());
  const next = KEYS[(i + d + KEYS.length) % KEYS.length];
  const url = new URL(location.href);
  url.searchParams.set('variant', next);
  history.replaceState(null, '', url);
  rerender();
}

function updateSwitcherLabel() {
  const v = prototypeVariant();
  document.querySelector('#proto-switcher span').textContent = `PROTOTYPE ${v} (${VARIANTS[v]})`;
}

function injectStyles() {
  if (document.getElementById('proto-styles')) return;
  const s = document.createElement('style');
  s.id = 'proto-styles';
  s.textContent = `
    #proto-switcher { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 9999;
      display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 999px;
      background: #fff; color: #000; font: 600 13px var(--font-family); box-shadow: 0 4px 20px rgba(0,0,0,.6); white-space: nowrap; }
    #proto-switcher button { background: #000; color: #fff; border: 0; border-radius: 999px; width: 28px; height: 28px; cursor: pointer; }
    #proto-switcher span { padding: 0 6px; }
    .proto-paused { margin-top: 32px; padding-top: 16px; border-top: 2px solid var(--border-light); padding-bottom: 80px; }
    .proto-paused > summary { list-style: none; cursor: pointer; font-size: 1.125rem; font-weight: 800; color: var(--text-secondary);
      display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
    .proto-paused > summary::-webkit-details-marker { display: none; }
    .proto-paused[open] .proto-chevron { transform: rotate(90deg); }
    .proto-chevron { display: inline-block; transition: transform var(--transition); }
    .proto-mixed-row { background: none; border: 1px dashed var(--border-light); border-radius: var(--radius-lg);
      color: var(--text-secondary); padding: 10px 16px; text-align: left; cursor: pointer; font: inherit; font-size: 0.8125rem; }
    .proto-group-label { font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
      color: var(--text-tertiary); margin-bottom: 4px; }
  `;
  document.head.appendChild(s);
}
