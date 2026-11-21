import { h } from '../ui.js';
import { itemPicker } from '../picker.js';
import { itemForm } from './item-form.js';

export function UpdateScreen() {
  const root = h('div', { class: 'page-update' });

  function step1() {
    const picker = itemPicker({ tipeRequired: true });
    const pilih = () => {
      const it = picker.item;
      if (!it) {
        picker.nama.setError('Pilih barang dulu');
        picker.nama.focus();
        return;
      }
      step2(it);
    };
    root.replaceChildren(
      h('div', { class: 'form' },
        h('p', { class: 'muted lead' }, 'Pilih barang yang datanya ingin diubah.'),
        picker.tipeRow,
        picker.nama.el,
        h('div', { class: 'actions start' }, h('button', { type: 'button', class: 'btn btn-pick', onclick: pilih }, 'Pilih'))),
    );
    window.scrollTo(0, 0);
  }

  function step2(it) {
    const form = itemForm({ item: it, onCancel: step1, onSaved: step1, onDeleted: step1 });
    root.replaceChildren(form.el);
    window.scrollTo(0, 0);
  }

  step1();
  return { title: 'Update Data Barang Tersedia', el: root };
}
