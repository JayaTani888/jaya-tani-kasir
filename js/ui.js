// Komponen tampilan: elemen, kolom isian, dropdown yang bisa diketik, pilihan, dialog, notifikasi.

import { norm, fmtMoneyInput, parseMoney, parseNum, fmtNum, stokParts } from './format.js';

let uid = 0;
const nid = (p = 'f') => `${p}${++uid}`;
const PROPS = new Set(['value', 'checked', 'disabled', 'hidden', 'readOnly', 'open']);

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (PROPS.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

const ICONS = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  plusbox: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
  boxes: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
};

export function icon(name, size = 22) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const attrs = {
    viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
  };
  Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
  s.innerHTML = ICONS[name] || '';
  return s;
}

function fieldShell(id, label, required, input, extra = []) {
  const labelText = h('span', null, label);
  const lab = h('label', { for: id }, labelText, required ? h('span', { class: 'req' }, ' *') : null);
  const wrap = h('div', { class: 'field' }, input, lab, ...extra);
  const err = h('div', { class: 'field-error', hidden: true });
  const outer = h('div', { class: 'field-outer' }, wrap, err);
  return {
    outer,
    labelText,
    setError(msg) {
      wrap.classList.toggle('invalid', !!msg);
      err.hidden = !msg;
      err.textContent = msg || '';
    },
  };
}

/** Kolom isian. mode: 'text' | 'money' (Rupiah, otomatis titik ribuan) | 'decimal' (boleh koma). */
export function textField({ label, required = false, value = null, mode = 'text', type = 'text', enterkeyhint } = {}) {
  const id = nid();
  const input = h('input', {
    id, type, placeholder: ' ', autocomplete: 'off', spellcheck: 'false', enterkeyhint,
    inputmode: mode === 'money' ? 'numeric' : mode === 'decimal' ? 'decimal' : null,
  });
  const sh = fieldShell(id, label, required, input);
  if (mode === 'money') {
    input.addEventListener('input', () => {
      const pos = input.selectionStart ?? input.value.length;
      const digitsBefore = input.value.slice(0, pos).replace(/\D/g, '').length;
      const f = fmtMoneyInput(input.value);
      input.value = f;
      let i = 0;
      let seen = 0;
      while (i < f.length && seen < digitsBefore) {
        if (/\d/.test(f[i])) seen++;
        i++;
      }
      try { input.setSelectionRange(i, i); } catch { /* tipe input tertentu */ }
    });
  }
  input.addEventListener('input', () => sh.setError(null));
  const api = {
    el: sh.outer,
    input,
    get raw() { return input.value.trim(); },
    get value() {
      const r = input.value.trim();
      return mode === 'money' ? parseMoney(r) : mode === 'decimal' ? parseNum(r) : r;
    },
    set value(v) {
      if (v == null || v === '' || (typeof v === 'number' && !isFinite(v))) input.value = '';
      else if (mode === 'money') input.value = fmtMoneyInput(String(Math.round(Number(v))));
      else if (mode === 'decimal') input.value = fmtNum(Number(v));
      else input.value = String(v);
    },
    setLabel(t) { sh.labelText.textContent = t; },
    setError: sh.setError,
    focus() { input.focus(); },
  };
  api.value = value;
  return api;
}

/**
 * Dropdown yang bisa diketik untuk menyaring isinya.
 * getOptions() → [{ value, label, display?, sub?, search? }] atau daftar teks.
 * allowNew: boleh mengetik nilai baru yang belum ada di daftar.
 */
export function combobox({ label, required = false, getOptions, allowNew = false, value = '', onChange, placeholderEmpty = 'Belum ada pilihan' }) {
  const id = nid();
  const listId = nid('l');
  const input = h('input', {
    id, type: 'text', placeholder: ' ', autocomplete: 'off', spellcheck: 'false', role: 'combobox',
    'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': listId, enterkeyhint: 'done',
  });
  const btn = h('button', { type: 'button', class: 'combo-btn', tabindex: '-1', 'aria-label': 'Buka pilihan' }, icon('chevron', 20));
  const list = h('ul', { id: listId, class: 'combo-list', role: 'listbox', hidden: true });
  const sh = fieldShell(id, label, required, input, [btn, list]);
  sh.outer.firstChild.classList.add('combo');

  let selected = '';
  let filtered = [];
  let active = -1;
  let isOpen = false;

  const opts = () => getOptions().map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const findOpt = (v) => {
    const all = opts();
    return all.find((o) => o.value === v) || (typeof v === 'string' ? all.find((o) => typeof o.value === 'string' && norm(o.value) === norm(v)) : undefined);
  };
  const displayOf = (v) => {
    if (v === '' || v == null) return '';
    const o = findOpt(v);
    return o ? o.display ?? o.label : allowNew ? String(v) : '';
  };

  function render(q) {
    const all = opts();
    const nq = norm(q);
    // Setiap kata yang diketik cukup ada di mana saja: "bimoli pouch", "aji 5".
    const words = nq.split(' ').filter(Boolean);
    filtered = nq
      ? all.filter((o) => {
          const hay = norm([o.label, o.sub, o.search].filter(Boolean).join(' '));
          return words.every((w) => hay.includes(w));
        })
      : all.slice();
    // Pilihan yang sudah ada didahulukan; "Tambah …" diletakkan paling bawah.
    if (allowNew && nq && !all.some((o) => norm(o.label) === nq)) filtered.push({ value: q.trim(), label: q.trim(), isNew: true });
    const selIdx = filtered.findIndex((o) => o.value === selected);
    active = nq ? (filtered.length ? 0 : -1) : selIdx;
    list.replaceChildren(
      ...(filtered.length
        ? filtered.map((o, i) =>
            h('li', {
              role: 'option', id: `${listId}-${i}`,
              class: [o.isNew ? 'opt-new' : '', i === active ? 'active' : '', o.value === selected ? 'sel' : ''].join(' '),
              onmousedown: (e) => e.preventDefault(),
              onclick: () => choose(o),
            },
            h('span', { class: 'opt-label' }, o.isNew ? `Tambah “${o.label}”` : o.label),
            o.sub ? h('span', { class: 'opt-sub' }, o.sub) : null))
        : [h('li', { class: 'empty' }, nq ? (allowNew ? 'Ketik untuk menambah' : 'Tidak ditemukan') : placeholderEmpty)]),
    );
    if (active >= 0) list.children[active]?.scrollIntoView({ block: 'nearest' });
  }
  function openList(q = '') {
    render(q);
    list.hidden = false;
    isOpen = true;
    input.setAttribute('aria-expanded', 'true');
  }
  function closeList() {
    list.hidden = true;
    isOpen = false;
    input.setAttribute('aria-expanded', 'false');
  }
  function choose(o) {
    selected = o.value;
    input.value = o.isNew ? o.value : o.display ?? o.label;
    closeList();
    sh.setError(null);
    onChange?.(selected, o);
  }
  function setActive(i) {
    if (!filtered.length) return;
    active = Math.max(0, Math.min(i, filtered.length - 1));
    [...list.children].forEach((li, j) => li.classList.toggle('active', j === active));
    list.children[active]?.scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('focus', () => {
    openList('');
    const v = input.value;
    setTimeout(() => {
      if (v && input.value === v) {
        try { input.select(); } catch { /* abaikan */ }
      }
    }, 0);
  });
  input.addEventListener('click', () => { if (!isOpen) openList(''); });
  input.addEventListener('input', () => {
    sh.setError(null);
    const had = selected;
    selected = allowNew ? input.value.trim() : '';
    openList(input.value);
    if (allowNew) onChange?.(selected, null);
    else if (had) onChange?.('', null);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) openList(input.value);
      else setActive(active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(active - 1);
    } else if (e.key === 'Enter') {
      if (isOpen && active >= 0 && filtered[active]) {
        e.preventDefault();
        choose(filtered[active]);
      }
    } else if (e.key === 'Escape') {
      closeList();
    }
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement === input) return;
      closeList();
      const txt = input.value.trim();
      if (allowNew) {
        const m = txt ? opts().find((o) => norm(o.label) === norm(txt)) : null;
        const v = m ? m.value : txt;
        const disp = m ? m.display ?? m.label : txt;
        if (v !== selected || input.value !== disp) {
          selected = v;
          input.value = disp;
          onChange?.(selected, m || null);
        }
      } else if (!selected) {
        const ms = txt ? opts().filter((o) => norm(o.display ?? o.label) === norm(txt) || norm(o.label) === norm(txt)) : [];
        if (ms.length === 1) choose(ms[0]);
        else input.value = '';
      } else {
        input.value = displayOf(selected);
      }
    }, 150);
  });
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    if (isOpen) closeList();
    else {
      openList('');
      input.focus();
    }
  });

  const api = {
    el: sh.outer,
    input,
    get value() { return selected || ''; },
    set value(v) {
      selected = v ?? '';
      input.value = displayOf(selected);
    },
    clear() {
      selected = '';
      input.value = '';
      closeList();
    },
    focus() { input.focus(); },
    setError: sh.setError,
  };
  api.value = value;
  return api;
}

/** Pilihan tunggal bergaya kotak centang (seperti desain: Ya / Tidak). */
export function choice({ options, value, onChange, className = '' }) {
  const name = nid('c');
  let current = value;
  const entries = options.map((o) => {
    const input = h('input', { type: 'radio', name, checked: o.value === value });
    const text = h('span', { class: 'check-text' }, o.label);
    input.addEventListener('change', () => {
      if (input.checked) {
        current = o.value;
        onChange?.(o.value);
      }
    });
    return { o, input, el: h('label', { class: 'check' }, input, h('span', { class: 'box', 'aria-hidden': 'true' }), text) };
  });
  return {
    el: h('div', { class: `choices ${className}`, role: 'radiogroup' }, entries.map((e) => e.el)),
    get value() { return current; },
    set value(v) {
      current = v;
      entries.forEach((e) => { e.input.checked = e.o.value === v; });
    },
  };
}

export const YA_TIDAK = [
  { value: true, label: 'Ya' },
  { value: false, label: 'Tidak' },
];

export function toast(msg, type = 'info', ms = 2800) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const t = h('div', { class: `toast ${type}`, role: type === 'err' ? 'alert' : 'status' }, msg);
  root.append(t);
  while (root.children.length > 3) root.firstChild.remove();
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

export function modal({ title, body, actions = [], dismissible = true, onClose }) {
  const prev = document.activeElement;
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const back = h('div', { class: 'modal-back' }, box);
  let closed = false;
  function onKey(e) {
    if (e.key === 'Escape' && dismissible) close(undefined);
  }
  function close(result) {
    if (closed) return;
    closed = true;
    back.remove();
    document.removeEventListener('keydown', onKey);
    if (prev && prev.tagName === 'BUTTON') {
      try { prev.focus({ preventScroll: true }); } catch { /* abaikan */ }
    }
    onClose?.(result);
  }
  const btns = actions.map((a) => {
    const b = h('button', { type: 'button', class: `btn ${a.class || ''}` }, a.label);
    b.addEventListener('click', async () => {
      if (b.disabled) return;
      b.disabled = true;
      let r;
      try {
        r = a.onClick ? await a.onClick() : undefined;
      } finally {
        b.disabled = false;
      }
      if (r !== false) close(a.value);
    });
    return b;
  });
  box.append(h('h2', null, title), body, btns.length ? h('div', { class: 'actions' }, btns) : '');
  if (dismissible) back.addEventListener('click', (e) => { if (e.target === back) close(undefined); });
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  setTimeout(() => {
    const first = box.querySelector('input');
    (first || btns[btns.length - 1])?.focus();
  }, 40);
  return { close, el: box };
}

export function confirmDialog(message, { title = 'Konfirmasi', okText = 'Ya', okClass = 'btn-save', cancelText = 'Batal' } = {}) {
  return new Promise((resolve) => {
    modal({
      title,
      body: h('p', { class: 'modal-msg' }, message),
      actions: [
        { label: cancelText, class: 'btn-ghost', value: false },
        { label: okText, class: okClass, value: true },
      ],
      onClose: (v) => resolve(!!v),
    });
  });
}

export function closeAllModals() {
  document.querySelectorAll('.modal-back').forEach((m) => m.remove());
}

/** Teks stok dengan satuan dicetak miring, mis. "9 Karung + 22 kg". */
export function stokNode(it, base) {
  const { neg, parts } = stokParts(it, base);
  const s = h('span', { class: 'stok' });
  if (neg) s.append('−');
  parts.forEach((p, i) => {
    if (i) s.append(' + ');
    s.append(`${fmtNum(p.n)} `, h('em', null, p.unit));
  });
  return s;
}
