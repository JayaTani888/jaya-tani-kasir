import { h } from '../ui.js';
import { itemForm } from './item-form.js';

export function InputScreen() {
  const root = h('div', { class: 'page-input' });
  function show(initial = {}) {
    const form = itemForm({
      initial,
      onCancel: () => { location.hash = '#/'; },
      // Setelah tersimpan, formulir dikosongkan untuk barang berikutnya (tipe & pilihan kemasan dipertahankan).
      onSaved: (it) => {
        show({ tipe: it.tipe, berkemasan: it.berkemasan, bisaEcer: it.bisaEcer });
        window.scrollTo(0, 0);
      },
    });
    root.replaceChildren(form.el);
  }
  show();
  return { title: 'Input Data Barang Baru', el: root };
}
