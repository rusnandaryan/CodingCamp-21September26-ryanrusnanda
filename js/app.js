/**
 * Ryan Rusnanda
 * Expense & Budget Visualizer
 * Vanilla JS — no frameworks
 * Data persisted in localStorage
 */

'use strict';

/* ============================================================
   Constants & State
   ============================================================ */

const STORAGE_KEY       = 'ebv_transactions';
const STORAGE_LIMIT_KEY = 'ebv_spend_limit';
const STORAGE_THEME_KEY = 'ebv_theme';

const CATEGORY_COLORS = {
  Food:      '#f59e0b',
  Transport: '#3b82f6',
  Fun:       '#ec4899',
};

const CATEGORY_EMOJIS = {
  Food:      '🍛',
  Transport: '🚌',
  Fun:       '🎉',
};

/** @type {{ id: string, name: string, amount: number, category: string }[]} */
let transactions = [];
let spendLimit   = 0;  // 0 means no limit set
let chartInstance = null;

/* ============================================================
   DOM References
   ============================================================ */
const form            = document.getElementById('transactionForm');
const itemNameInput   = document.getElementById('itemName');
const amountInput     = document.getElementById('amount');
const categorySelect  = document.getElementById('category');
const nameError       = document.getElementById('nameError');
const amountError     = document.getElementById('amountError');
const categoryError   = document.getElementById('categoryError');
const totalBalanceEl  = document.getElementById('totalBalance');
const transactionList = document.getElementById('transactionList');
const listEmpty       = document.getElementById('listEmpty');
const spendLimitInput = document.getElementById('spendLimit');
const limitWarning    = document.getElementById('limitWarning');
const balanceCard     = document.querySelector('.balance-card');
const themeToggle     = document.getElementById('themeToggle');
const chartCanvas     = document.getElementById('spendingChart');
const chartEmpty      = document.getElementById('chartEmpty');

/* ============================================================
   Initialise
   ============================================================ */
function init() {
  loadFromStorage();
  applyTheme(localStorage.getItem(STORAGE_THEME_KEY) || 'light');
  renderAll();
}

/* ============================================================
   Storage
   ============================================================ */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    transactions = raw ? JSON.parse(raw) : [];
  } catch {
    transactions = [];
  }

  const limit = parseFloat(localStorage.getItem(STORAGE_LIMIT_KEY));
  spendLimit = isNaN(limit) ? 0 : limit;
  if (spendLimit > 0) spendLimitInput.value = spendLimit;
}

function saveTransactions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

function saveLimit() {
  localStorage.setItem(STORAGE_LIMIT_KEY, spendLimit);
}

/* ============================================================
   Render — orchestrator
   ============================================================ */
function renderAll() {
  renderBalance();
  renderList();
  renderChart();
}

/* ── Balance ──────────────────────────────────────────────── */
function renderBalance() {
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  totalBalanceEl.textContent = formatCurrency(total);

  const isOver = spendLimit > 0 && total > spendLimit;
  limitWarning.classList.toggle('hidden', !isOver);
  balanceCard.classList.toggle('over-limit', isOver);
}

/* ── Transaction List ─────────────────────────────────────── */
function renderList() {
  transactionList.innerHTML = '';

  if (transactions.length === 0) {
    listEmpty.classList.remove('hidden');
    return;
  }
  listEmpty.classList.add('hidden');

  const total = transactions.reduce((sum, t) => sum + t.amount, 0);

  transactions.forEach(t => {
    const isOver = spendLimit > 0 && total > spendLimit;
    const li = createTransactionEl(t, isOver);
    transactionList.appendChild(li);
  });
}

/**
 * Build a single transaction list item element.
 * @param {{ id:string, name:string, amount:number, category:string }} t
 * @param {boolean} isOver - whether the total exceeds the limit
 */
function createTransactionEl(t, isOver) {
  const li = document.createElement('li');
  li.className = 'transaction-item' + (isOver ? ' over-limit' : '');
  li.dataset.id = t.id;

  const catClass = t.category.toLowerCase();
  const emoji    = CATEGORY_EMOJIS[t.category] || '';

  li.innerHTML = `
    <div class="item-info">
      <span class="item-name">${escapeHTML(t.name)}</span>
      <div class="item-meta">
        <span class="category-pill ${catClass}">${emoji} ${escapeHTML(t.category)}</span>
        ${isOver ? '<span class="over-limit-badge">⚠️ Over limit</span>' : ''}
      </div>
    </div>
    <div class="item-right">
      <span class="item-amount">${formatCurrency(t.amount)}</span>
      <button class="delete-btn" aria-label="Delete ${escapeHTML(t.name)}">Delete</button>
    </div>
  `;

  li.querySelector('.delete-btn').addEventListener('click', () => deleteTransaction(t.id));
  return li;
}

/* ── Chart ────────────────────────────────────────────────── */
function renderChart() {
  // Aggregate totals per category
  const totals = {};
  transactions.forEach(t => {
    totals[t.category] = (totals[t.category] || 0) + t.amount;
  });

  const labels = Object.keys(totals);
  const data   = Object.values(totals);

  const hasData = labels.length > 0;
  chartEmpty.classList.toggle('visible', !hasData);
  chartCanvas.style.display = hasData ? 'block' : 'none';

  if (!hasData) {
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }

  const colors = labels.map(l => CATEGORY_COLORS[l] || '#94a3b8');

  if (chartInstance) {
    // Update existing chart
    chartInstance.data.labels              = labels;
    chartInstance.data.datasets[0].data    = data;
    chartInstance.data.datasets[0].backgroundColor = colors;
    chartInstance.update();
  } else {
    chartInstance = new Chart(chartCanvas, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: getComputedStyle(document.body)
            .getPropertyValue('--surface').trim() || '#fff',
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: getComputedStyle(document.body)
                .getPropertyValue('--text-primary').trim() || '#1a202c',
              font: { size: 13, weight: '600' },
              padding: 14,
            },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${formatCurrency(ctx.parsed)}`,
            },
          },
        },
      },
    });
  }
}

/* ============================================================
   Add Transaction
   ============================================================ */
form.addEventListener('submit', e => {
  e.preventDefault();
  if (!validateForm()) return;

  const transaction = {
    id:       generateId(),
    name:     itemNameInput.value.trim(),
    amount:   parseFloat(amountInput.value),
    category: categorySelect.value,
  };

  transactions.push(transaction);
  saveTransactions();
  renderAll();
  resetForm();
});

function validateForm() {
  let valid = true;

  const name     = itemNameInput.value.trim();
  const amount   = parseFloat(amountInput.value);
  const category = categorySelect.value;

  // Name
  if (!name) {
    showError(itemNameInput, nameError);
    valid = false;
  } else {
    clearError(itemNameInput, nameError);
  }

  // Amount
  if (!amountInput.value || isNaN(amount) || amount <= 0) {
    showError(amountInput, amountError);
    valid = false;
  } else {
    clearError(amountInput, amountError);
  }

  // Category
  if (!category) {
    showError(categorySelect, categoryError);
    valid = false;
  } else {
    clearError(categorySelect, categoryError);
  }

  return valid;
}

function showError(field, msgEl) {
  field.classList.add('invalid');
  msgEl.classList.add('visible');
}

function clearError(field, msgEl) {
  field.classList.remove('invalid');
  msgEl.classList.remove('visible');
}

function resetForm() {
  form.reset();
  [itemNameInput, amountInput, categorySelect].forEach(f => f.classList.remove('invalid'));
  [nameError, amountError, categoryError].forEach(m => m.classList.remove('visible'));
}

/* ============================================================
   Delete Transaction
   ============================================================ */
function deleteTransaction(id) {
  transactions = transactions.filter(t => t.id !== id);
  saveTransactions();
  renderAll();
}

/* ============================================================
   Spend Limit
   ============================================================ */
spendLimitInput.addEventListener('input', () => {
  const val = parseFloat(spendLimitInput.value);
  spendLimit = isNaN(val) || val <= 0 ? 0 : val;
  saveLimit();
  renderAll();
});

/* ============================================================
   Dark / Light Mode
   ============================================================ */
function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  document.body.classList.toggle('light', theme === 'light');
  themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem(STORAGE_THEME_KEY, theme);

  // Rebuild chart so legend/border colours update
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
    renderChart();
  }
}

themeToggle.addEventListener('click', () => {
  const isDark = document.body.classList.contains('dark');
  applyTheme(isDark ? 'light' : 'dark');
});

/* ============================================================
   Utilities
   ============================================================ */
function formatCurrency(n) {
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Prevent XSS from user-supplied names */
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============================================================
   Boot
   ============================================================ */
init();
