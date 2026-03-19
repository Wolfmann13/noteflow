/* ===== NoteFlow — Application Logic ===== */
(() => {
  'use strict';

  // ===== Constants =====
  const DB_NAME = 'NoteFlowDB';
  const DB_VERSION = 1;
  const CATEGORY_COLORS = [
    '#6c5ce7', '#00cec9', '#fd79a8', '#e17055',
    '#00b894', '#fdcb6e', '#0984e3', '#d63031',
    '#e84393', '#55efc4', '#74b9ff', '#fab1a0'
  ];

  const DEFAULT_TEMPLATES = [
    {
      id: 'tpl-biweekly',
      name: 'Bi-Weekly Review',
      recurrence: 'biweekly',
      content: 'Bi-Weekly Review\n\nAccomplishments:\n\nChallenges:\n\nGoals for next 2 weeks:\n\nNotes:',
      checkItems: [
        { text: 'Review completed tasks', checked: false },
        { text: 'Update project timeline', checked: false },
        { text: 'Follow up on blockers', checked: false },
        { text: 'Plan upcoming priorities', checked: false }
      ]
    },
    {
      id: 'tpl-monthly',
      name: 'Monthly Planner',
      recurrence: 'monthly',
      content: 'Monthly Planner\n\nKey Objectives:\n\nBudget / Expenses:\n\nImportant Dates:\n\nReflections:',
      checkItems: [
        { text: 'Review last month\'s goals', checked: false },
        { text: 'Set new monthly goals', checked: false },
        { text: 'Review budget', checked: false },
        { text: 'Schedule important events', checked: false },
        { text: 'Back up important files', checked: false }
      ]
    },
    {
      id: 'tpl-grocery',
      name: 'Shopping List',
      recurrence: 'none',
      content: 'Shopping List',
      checkItems: [
        { text: '', checked: false }
      ]
    }
  ];

  // ===== State =====
  let db = null;
  let state = {
    notes: [],
    categories: [],
    templates: [...DEFAULT_TEMPLATES],
    currentNote: null,
    currentTemplate: null,
    activeCategory: 'all',
    userName: 'Me',
    darkMode: true,
    searchQuery: ''
  };

  // ===== DOM Refs =====
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const dom = {
    splash: $('#splash-screen'),
    app: $('#app'),
    // Views
    viewHome: $('#view-home'),
    viewEditor: $('#view-editor'),
    viewSettings: $('#view-settings'),
    viewTemplateEditor: $('#view-template-editor'),
    // Home
    notesGrid: $('#notes-grid'),
    emptyState: $('#empty-state'),
    categoryPills: $('#category-pills'),
    searchBar: $('#search-bar'),
    searchInput: $('#search-input'),
    // Editor
    editorTitle: $('#editor-title'),
    editorContent: $('#editor-content'),
    editorCategoryBtn: $('#editor-category-btn'),
    editorCategoryDot: $('#editor-category-dot'),
    editorCategoryLabel: $('#editor-category-label'),
    checklistItems: $('#checklist-items'),
    // Sheets
    sheetNew: $('#sheet-new'),
    sheetCategory: $('#sheet-category'),
    sheetHistory: $('#sheet-history'),
    templateList: $('#template-list'),
    categoryList: $('#category-list'),
    historyList: $('#history-list'),
    newCatForm: $('#new-cat-form'),
    newCatName: $('#new-cat-name'),
    colorPicker: $('#color-picker'),
    // Settings
    settingsName: $('#settings-name'),
    toggleDark: $('#toggle-dark'),
    settingsCategories: $('#settings-categories'),
    settingsTemplates: $('#settings-templates'),
    importFile: $('#import-file'),
    // Template editor
    tplEditorTitle: $('#tpl-editor-title'),
    tplName: $('#tpl-name'),
    tplRecurrence: $('#tpl-recurrence'),
    tplContent: $('#tpl-content'),
    tplChecklistItems: $('#tpl-checklist-items'),
    // Toast
    toast: $('#toast')
  };

  // ===== IndexedDB =====
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('notes')) d.createObjectStore('notes', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('categories')) d.createObjectStore('categories', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('templates')) d.createObjectStore('templates', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = (e) => reject(e);
    });
  }

  function dbGet(store) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const s = tx.objectStore(store);
      const req = s.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function dbPut(store, data) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const s = tx.objectStore(store);
      const req = s.put(data);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function dbDelete(store, id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const s = tx.objectStore(store);
      const req = s.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // ===== Data Persistence =====
  async function loadData() {
    state.notes = await dbGet('notes');
    state.categories = await dbGet('categories');
    const templates = await dbGet('templates');
    if (templates.length > 0) {
      state.templates = templates;
    } else {
      // Save defaults
      for (const t of DEFAULT_TEMPLATES) await dbPut('templates', t);
    }
    const settings = await dbGet('settings');
    for (const s of settings) {
      if (s.key === 'userName') state.userName = s.value;
      if (s.key === 'darkMode') state.darkMode = s.value;
    }
  }

  async function saveNote(note) {
    await dbPut('notes', note);
    const idx = state.notes.findIndex(n => n.id === note.id);
    if (idx >= 0) state.notes[idx] = note;
    else state.notes.push(note);
  }

  async function deleteNote(id) {
    await dbDelete('notes', id);
    state.notes = state.notes.filter(n => n.id !== id);
  }

  async function saveCategory(cat) {
    await dbPut('categories', cat);
    const idx = state.categories.findIndex(c => c.id === cat.id);
    if (idx >= 0) state.categories[idx] = cat;
    else state.categories.push(cat);
  }

  async function deleteCategoryData(id) {
    await dbDelete('categories', id);
    state.categories = state.categories.filter(c => c.id !== id);
    // Remove category from notes
    for (const n of state.notes) {
      if (n.categoryId === id) {
        n.categoryId = null;
        await saveNote(n);
      }
    }
  }

  async function saveTemplate(tpl) {
    await dbPut('templates', tpl);
    const idx = state.templates.findIndex(t => t.id === tpl.id);
    if (idx >= 0) state.templates[idx] = tpl;
    else state.templates.push(tpl);
  }

  async function deleteTemplate(id) {
    await dbDelete('templates', id);
    state.templates = state.templates.filter(t => t.id !== id);
  }

  async function saveSetting(key, value) {
    state[key] = value;
    await dbPut('settings', { key, value });
  }

  // ===== Utility =====
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }

  function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || '';
  }

  function showToast(msg) {
    dom.toast.textContent = msg;
    dom.toast.classList.add('show');
    setTimeout(() => dom.toast.classList.remove('show'), 2500);
  }

  // ===== Navigation =====
  function showView(viewEl) {
    $$('.view').forEach(v => v.classList.remove('active'));
    viewEl.classList.add('active');
  }

  // ===== Render Home =====
  function renderHome() {
    renderCategoryPills();
    renderNotes();
  }

  function renderCategoryPills() {
    const container = dom.categoryPills;
    container.innerHTML = '<button class="pill ' + (state.activeCategory === 'all' ? 'active' : '') + '" data-category="all">All</button>';
    state.categories.forEach(cat => {
      const pill = document.createElement('button');
      pill.className = 'pill' + (state.activeCategory === cat.id ? ' active' : '');
      pill.dataset.category = cat.id;
      pill.innerHTML = `<span class="cat-dot" style="background:${cat.color}; display:inline-block; margin-right:5px;"></span>${cat.name}`;
      container.appendChild(pill);
    });

    container.querySelectorAll('.pill').forEach(p => {
      p.addEventListener('click', () => {
        state.activeCategory = p.dataset.category;
        renderHome();
      });
    });
  }

  function renderNotes() {
    const grid = dom.notesGrid;
    // Remove existing cards (keep empty state)
    grid.querySelectorAll('.note-card').forEach(c => c.remove());

    let notes = [...state.notes].sort((a, b) => b.updatedAt - a.updatedAt);

    // Filter by category
    if (state.activeCategory !== 'all') {
      notes = notes.filter(n => n.categoryId === state.activeCategory);
    }

    // Filter by search
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      notes = notes.filter(n =>
        n.title.toLowerCase().includes(q) ||
        stripHtml(n.content).toLowerCase().includes(q)
      );
    }

    if (notes.length === 0) {
      dom.emptyState.classList.remove('hidden');
    } else {
      dom.emptyState.classList.add('hidden');
      notes.forEach((note, i) => {
        const card = document.createElement('div');
        card.className = 'note-card';
        card.style.animationDelay = `${i * 0.04}s`;

        const cat = state.categories.find(c => c.id === note.categoryId);
        const catColor = cat ? cat.color : 'transparent';
        card.style.setProperty('--cat-color', catColor);
        card.querySelector?.('::before')?.style?.setProperty('background', catColor);

        const preview = stripHtml(note.content).slice(0, 100);
        const checkedCount = (note.checkItems || []).filter(i => i.checked).length;
        const totalChecks = (note.checkItems || []).length;

        card.innerHTML = `
          <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${catColor};border-radius:16px 16px 0 0;"></div>
          <div class="note-card-title">${escHtml(note.title || 'Untitled')}</div>
          <div class="note-card-preview">${escHtml(preview)}</div>
          <div class="note-card-meta">
            <span>${timeAgo(note.updatedAt)}</span>
            ${totalChecks > 0 ? `<span class="note-card-checks">✓ ${checkedCount}/${totalChecks}</span>` : ''}
          </div>
          ${cat ? `<div class="note-card-cat"><span class="cat-dot" style="background:${cat.color}"></span>${escHtml(cat.name)}</div>` : ''}
        `;

        card.addEventListener('click', () => openNote(note));
        grid.insertBefore(card, dom.emptyState);
      });
    }
  }

  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== Note Editor =====
  function openNote(note) {
    state.currentNote = { ...note, checkItems: note.checkItems ? note.checkItems.map(i => ({ ...i })) : [] };
    dom.editorTitle.value = note.title || '';
    dom.editorContent.innerHTML = note.content || '';
    updateEditorCategory();
    renderChecklistItems();
    showView(dom.viewEditor);
  }

  function createBlankNote() {
    const note = {
      id: uid(),
      title: '',
      content: '',
      categoryId: null,
      checkItems: [],
      history: [{ user: state.userName, action: 'Created note', time: Date.now() }],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    openNote(note);
  }

  function createNoteFromTemplate(tpl) {
    const note = {
      id: uid(),
      title: tpl.name + (tpl.recurrence !== 'none' ? ` — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''),
      content: tpl.content,
      categoryId: null,
      checkItems: tpl.checkItems.map(i => ({ ...i, id: uid() })),
      history: [{ user: state.userName, action: `Created from template "${tpl.name}"`, time: Date.now() }],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    openNote(note);
  }

  function updateEditorCategory() {
    const cat = state.categories.find(c => c.id === state.currentNote?.categoryId);
    if (cat) {
      dom.editorCategoryDot.style.background = cat.color;
      dom.editorCategoryDot.style.display = 'inline-block';
      dom.editorCategoryLabel.textContent = cat.name;
    } else {
      dom.editorCategoryDot.style.display = 'none';
      dom.editorCategoryLabel.textContent = 'No category';
    }
  }

  function renderChecklistItems() {
    const container = dom.checklistItems;
    container.innerHTML = '';
    (state.currentNote?.checkItems || []).forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = 'check-item' + (item.checked ? ' checked' : '');
      el.innerHTML = `
        <input type="checkbox" ${item.checked ? 'checked' : ''}>
        <input type="text" class="check-item-text" value="${escHtml(item.text)}" placeholder="Item text...">
        <button class="check-item-delete" aria-label="Remove">&times;</button>
      `;
      const cb = el.querySelector('input[type="checkbox"]');
      const textInput = el.querySelector('.check-item-text');
      const delBtn = el.querySelector('.check-item-delete');

      cb.addEventListener('change', () => {
        state.currentNote.checkItems[idx].checked = cb.checked;
        el.classList.toggle('checked', cb.checked);
        autoSaveCurrentNote('Toggled checklist item');
      });
      textInput.addEventListener('input', () => {
        state.currentNote.checkItems[idx].text = textInput.value;
      });
      textInput.addEventListener('blur', () => {
        autoSaveCurrentNote('Updated checklist item');
      });
      delBtn.addEventListener('click', () => {
        state.currentNote.checkItems.splice(idx, 1);
        renderChecklistItems();
        autoSaveCurrentNote('Removed checklist item');
      });

      container.appendChild(el);
    });
  }

  function addChecklistItem() {
    if (!state.currentNote) return;
    state.currentNote.checkItems.push({ id: uid(), text: '', checked: false });
    renderChecklistItems();
    // Focus the last item
    const items = dom.checklistItems.querySelectorAll('.check-item-text');
    if (items.length) items[items.length - 1].focus();
  }

  let saveTimer = null;
  function autoSaveCurrentNote(action) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (!state.currentNote) return;
      const note = state.currentNote;
      note.title = dom.editorTitle.value;
      note.content = dom.editorContent.innerHTML;
      note.updatedAt = Date.now();
      // Add history
      if (action) {
        note.history = note.history || [];
        note.history.push({ user: state.userName, action, time: Date.now() });
      }
      await saveNote({ ...note, checkItems: note.checkItems.map(i => ({ ...i })) });
    }, 400);
  }

  // ===== Sheets =====
  function openSheet(sheet) {
    sheet.classList.add('open');
    sheet.querySelector('.sheet-backdrop').addEventListener('click', () => closeSheet(sheet), { once: true });
  }

  function closeSheet(sheet) {
    sheet.classList.remove('open');
  }

  // ===== Category Sheet =====
  function renderCategorySheet() {
    const list = dom.categoryList;
    list.innerHTML = '';

    // "None" option
    const noneBtn = document.createElement('button');
    noneBtn.className = 'cat-option' + (!state.currentNote?.categoryId ? ' selected' : '');
    noneBtn.innerHTML = '<span class="cat-dot" style="background:var(--text-tertiary)"></span> No category';
    noneBtn.addEventListener('click', () => {
      if (state.currentNote) state.currentNote.categoryId = null;
      updateEditorCategory();
      autoSaveCurrentNote('Removed category');
      closeSheet(dom.sheetCategory);
    });
    list.appendChild(noneBtn);

    state.categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'cat-option' + (state.currentNote?.categoryId === cat.id ? ' selected' : '');
      btn.innerHTML = `<span class="cat-dot" style="background:${cat.color}"></span> ${escHtml(cat.name)}`;
      btn.addEventListener('click', () => {
        if (state.currentNote) state.currentNote.categoryId = cat.id;
        updateEditorCategory();
        autoSaveCurrentNote(`Changed category to "${cat.name}"`);
        closeSheet(dom.sheetCategory);
      });
      list.appendChild(btn);
    });

    // Color picker
    dom.colorPicker.innerHTML = '';
    let selectedColor = CATEGORY_COLORS[0];
    CATEGORY_COLORS.forEach((c, i) => {
      const dot = document.createElement('button');
      dot.className = 'color-dot' + (i === 0 ? ' selected' : '');
      dot.style.background = c;
      dot.addEventListener('click', () => {
        dom.colorPicker.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
        dot.classList.add('selected');
        selectedColor = c;
      });
      dom.colorPicker.appendChild(dot);
    });

    // Wire up new category form
    dom.newCatForm.classList.add('hidden');
    $('#btn-new-category').onclick = () => {
      dom.newCatForm.classList.toggle('hidden');
      if (!dom.newCatForm.classList.contains('hidden')) dom.newCatName.focus();
    };
    $('#btn-save-cat').onclick = async () => {
      const name = dom.newCatName.value.trim();
      if (!name) return;
      const cat = { id: uid(), name, color: selectedColor };
      await saveCategory(cat);
      dom.newCatName.value = '';
      dom.newCatForm.classList.add('hidden');
      renderCategorySheet();
      renderHome();
      showToast(`Category "${name}" created`);
    };
  }

  // ===== History Sheet =====
  function renderHistorySheet() {
    const list = dom.historyList;
    list.innerHTML = '';
    const history = [...(state.currentNote?.history || [])].reverse();
    if (history.length === 0) {
      list.innerHTML = '<p style="color:var(--text-tertiary);text-align:center;padding:20px;">No edit history yet</p>';
      return;
    }
    history.forEach(entry => {
      const el = document.createElement('div');
      el.className = 'history-entry';
      el.innerHTML = `
        <div class="history-user">${escHtml(entry.user)}</div>
        <div class="history-action">${escHtml(entry.action)}</div>
        <div class="history-time">${formatDate(entry.time)}</div>
      `;
      list.appendChild(el);
    });
  }

  // ===== Template Sheet =====
  function renderTemplateSheet() {
    const list = dom.templateList;
    list.innerHTML = '';
    state.templates.forEach(tpl => {
      const item = document.createElement('button');
      item.className = 'template-item';
      item.innerHTML = `
        <div class="tpl-info">
          <div class="tpl-name">${escHtml(tpl.name)}</div>
          ${tpl.recurrence !== 'none' ? `<div class="tpl-badge">${tpl.recurrence}</div>` : ''}
        </div>
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-tertiary)"><path d="m6 4 5 5-5 5"/></svg>
      `;
      item.addEventListener('click', () => {
        createNoteFromTemplate(tpl);
        closeSheet(dom.sheetNew);
        showToast(`Created from "${tpl.name}"`);
      });
      list.appendChild(item);
    });
    list.classList.remove('hidden');
  }

  // ===== Share =====
  async function shareNote() {
    const note = state.currentNote;
    if (!note) return;
    const text = `${note.title || 'Untitled'}\n\n${stripHtml(note.content)}`;
    const checkText = (note.checkItems || []).map(i => `${i.checked ? '☑' : '☐'} ${i.text}`).join('\n');
    const fullText = checkText ? `${text}\n\n--- Checklist ---\n${checkText}` : text;

    if (navigator.share) {
      try {
        await navigator.share({ title: note.title || 'NoteFlow Note', text: fullText });
      } catch (e) { /* User cancelled */ }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(fullText);
        showToast('Note copied to clipboard');
      } catch {
        showToast('Could not share');
      }
    }
  }

  // ===== Settings =====
  function renderSettings() {
    dom.settingsName.value = state.userName;
    dom.toggleDark.checked = state.darkMode;
    renderSettingsCategories();
    renderSettingsTemplates();
  }

  function renderSettingsCategories() {
    const container = dom.settingsCategories;
    container.innerHTML = '';
    if (state.categories.length === 0) {
      container.innerHTML = '<p style="color:var(--text-tertiary);font-size:13px;">No categories yet</p>';
      return;
    }
    state.categories.forEach(cat => {
      const el = document.createElement('div');
      el.className = 'settings-cat-item';
      el.innerHTML = `
        <div class="settings-cat-info">
          <span class="cat-dot" style="background:${cat.color}"></span>
          <span class="settings-item-name">${escHtml(cat.name)}</span>
        </div>
        <button class="settings-delete-btn">Delete</button>
      `;
      el.querySelector('.settings-delete-btn').addEventListener('click', async () => {
        await deleteCategoryData(cat.id);
        renderSettings();
        renderHome();
        showToast(`"${cat.name}" deleted`);
      });
      container.appendChild(el);
    });
  }

  function renderSettingsTemplates() {
    const container = dom.settingsTemplates;
    container.innerHTML = '';
    state.templates.forEach(tpl => {
      const el = document.createElement('div');
      el.className = 'settings-tpl-item';
      el.innerHTML = `
        <div class="settings-tpl-info">
          <span class="settings-item-name">${escHtml(tpl.name)}</span>
          ${tpl.recurrence !== 'none' ? `<span class="tpl-badge" style="margin-left:8px;">${tpl.recurrence}</span>` : ''}
        </div>
        <div>
          <button class="text-btn" style="font-size:13px;">Edit</button>
          <button class="settings-delete-btn">Delete</button>
        </div>
      `;
      el.querySelector('.text-btn').addEventListener('click', () => openTemplateEditor(tpl));
      el.querySelector('.settings-delete-btn').addEventListener('click', async () => {
        await deleteTemplate(tpl.id);
        renderSettings();
        showToast(`Template "${tpl.name}" deleted`);
      });
      container.appendChild(el);
    });
  }

  // ===== Template Editor =====
  function openTemplateEditor(tpl) {
    state.currentTemplate = tpl ? { ...tpl, checkItems: tpl.checkItems.map(i => ({ ...i })) } : {
      id: uid(),
      name: '',
      recurrence: 'none',
      content: '',
      checkItems: []
    };
    dom.tplEditorTitle.textContent = tpl ? 'Edit Template' : 'New Template';
    dom.tplName.value = state.currentTemplate.name;
    dom.tplRecurrence.value = state.currentTemplate.recurrence;
    dom.tplContent.innerHTML = state.currentTemplate.content;
    renderTemplateChecklistItems();
    showView(dom.viewTemplateEditor);
  }

  function renderTemplateChecklistItems() {
    const container = dom.tplChecklistItems;
    container.innerHTML = '';
    (state.currentTemplate?.checkItems || []).forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = 'check-item';
      el.innerHTML = `
        <input type="text" class="check-item-text" value="${escHtml(item.text)}" placeholder="Item text...">
        <button class="check-item-delete" aria-label="Remove">&times;</button>
      `;
      el.querySelector('.check-item-text').addEventListener('input', (e) => {
        state.currentTemplate.checkItems[idx].text = e.target.value;
      });
      el.querySelector('.check-item-delete').addEventListener('click', () => {
        state.currentTemplate.checkItems.splice(idx, 1);
        renderTemplateChecklistItems();
      });
      container.appendChild(el);
    });
  }

  async function saveCurrentTemplate() {
    const tpl = state.currentTemplate;
    if (!tpl) return;
    tpl.name = dom.tplName.value.trim() || 'Untitled Template';
    tpl.recurrence = dom.tplRecurrence.value;
    tpl.content = dom.tplContent.innerHTML;
    await saveTemplate({ ...tpl });
    showToast(`Template "${tpl.name}" saved`);
    showView(dom.viewSettings);
    renderSettings();
  }

  // ===== Export / Import =====
  function exportData() {
    const data = {
      notes: state.notes,
      categories: state.categories,
      templates: state.templates,
      exportedAt: Date.now(),
      exportedBy: state.userName
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `noteflow-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Notes exported!');
  }

  async function importData(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.notes) {
        for (const n of data.notes) {
          // Add import history entry
          n.history = n.history || [];
          n.history.push({ user: state.userName, action: `Imported from ${data.exportedBy || 'unknown'}`, time: Date.now() });
          await saveNote(n);
        }
      }
      if (data.categories) {
        for (const c of data.categories) await saveCategory(c);
      }
      if (data.templates) {
        for (const t of data.templates) await saveTemplate(t);
      }
      renderHome();
      showToast(`Imported ${(data.notes || []).length} notes!`);
    } catch {
      showToast('Invalid import file');
    }
  }

  // ===== Event Bindings =====
  function bindEvents() {
    // Search
    $('#btn-search-toggle').addEventListener('click', () => {
      dom.searchBar.classList.toggle('hidden');
      if (!dom.searchBar.classList.contains('hidden')) dom.searchInput.focus();
    });
    dom.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderNotes();
    });
    $('#btn-search-clear').addEventListener('click', () => {
      dom.searchInput.value = '';
      state.searchQuery = '';
      renderNotes();
    });

    // Settings
    $('#btn-settings').addEventListener('click', () => {
      renderSettings();
      showView(dom.viewSettings);
    });
    $('#btn-settings-back').addEventListener('click', () => {
      showView(dom.viewHome);
      renderHome();
    });
    dom.settingsName.addEventListener('change', () => {
      saveSetting('userName', dom.settingsName.value.trim() || 'Me');
    });
    dom.toggleDark.addEventListener('change', () => {
      const dark = dom.toggleDark.checked;
      saveSetting('darkMode', dark);
      document.documentElement.setAttribute('data-theme', dark ? '' : 'light');
      document.querySelector('meta[name="theme-color"]').content = dark ? '#0a0a0f' : '#f2f2f7';
    });

    // New note FAB
    $('#btn-new-note').addEventListener('click', () => {
      dom.templateList.classList.add('hidden');
      openSheet(dom.sheetNew);
    });
    $('#btn-blank-note').addEventListener('click', () => {
      closeSheet(dom.sheetNew);
      createBlankNote();
    });
    $('#btn-template-pick').addEventListener('click', () => {
      renderTemplateSheet();
    });

    // Editor
    $('#btn-back').addEventListener('click', async () => {
      // Save before going back
      if (state.currentNote) {
        const note = state.currentNote;
        note.title = dom.editorTitle.value;
        note.content = dom.editorContent.innerHTML;
        note.updatedAt = Date.now();
        if (note.title || stripHtml(note.content) || note.checkItems.length > 0) {
          await saveNote({ ...note, checkItems: note.checkItems.map(i => ({ ...i })) });
        }
        state.currentNote = null;
      }
      showView(dom.viewHome);
      renderHome();
    });
    dom.editorTitle.addEventListener('input', () => autoSaveCurrentNote('Updated title'));
    dom.editorContent.addEventListener('input', () => autoSaveCurrentNote('Updated content'));

    // Editor actions
    dom.editorCategoryBtn.addEventListener('click', () => {
      renderCategorySheet();
      openSheet(dom.sheetCategory);
    });
    $('#btn-add-check').addEventListener('click', addChecklistItem);
    $('#btn-history').addEventListener('click', () => {
      renderHistorySheet();
      openSheet(dom.sheetHistory);
    });
    $('#btn-share').addEventListener('click', shareNote);
    $('#btn-delete-note').addEventListener('click', async () => {
      if (!state.currentNote) return;
      if (confirm('Delete this note?')) {
        await deleteNote(state.currentNote.id);
        state.currentNote = null;
        showView(dom.viewHome);
        renderHome();
        showToast('Note deleted');
      }
    });

    // Export / Import
    $('#btn-export').addEventListener('click', exportData);
    $('#btn-import').addEventListener('click', () => dom.importFile.click());
    dom.importFile.addEventListener('change', (e) => {
      if (e.target.files[0]) importData(e.target.files[0]);
    });

    // Template editor
    $('#btn-new-template').addEventListener('click', () => openTemplateEditor(null));
    $('#btn-tpl-back').addEventListener('click', () => {
      showView(dom.viewSettings);
      renderSettings();
    });
    $('#btn-save-template').addEventListener('click', saveCurrentTemplate);
    $('#btn-tpl-add-check').addEventListener('click', () => {
      if (!state.currentTemplate) return;
      state.currentTemplate.checkItems.push({ id: uid(), text: '', checked: false });
      renderTemplateChecklistItems();
      const items = dom.tplChecklistItems.querySelectorAll('.check-item-text');
      if (items.length) items[items.length - 1].focus();
    });

    // Close sheets on backdrop clicks (already handled in openSheet)
  }

  // ===== Init =====
  async function init() {
    try {
      await openDB();
      await loadData();

      // Apply theme
      if (!state.darkMode) {
        document.documentElement.setAttribute('data-theme', 'light');
        document.querySelector('meta[name="theme-color"]').content = '#f2f2f7';
      }

      renderHome();
      bindEvents();

      // Hide splash
      setTimeout(() => {
        dom.splash.classList.add('hidden');
        dom.app.classList.remove('hidden');
      }, 1200);

    } catch (err) {
      console.error('Init error:', err);
      dom.splash.classList.add('hidden');
      dom.app.classList.remove('hidden');
    }
  }

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
