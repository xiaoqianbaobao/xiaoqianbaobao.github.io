/* ============================================================
   认知网关 (Cognitive Gateway) — Application Logic
   Design spec v1.0 — csqread.top/gateway/
   ============================================================ */

(function(){
  'use strict';

  /* ======================= Constants ======================= */
  const PREFIX = 'cg_';
  const KEYS = {
    items: PREFIX + 'items',
    outputs: PREFIX + 'outputs',
    settings: PREFIX + 'settings',
    dailyLog: PREFIX + 'dailyLog'
  };

  const SYNC_KEYS = {
    token: PREFIX + 'sync_token',
    gistId: PREFIX + 'sync_gist_id'
  };
  const GIST_FILENAME = 'cognitive-gateway-data.json';


  const DEFAULT_SETTINGS = {
    dailyQuota: { deep: 2, skim: 5 },
    archiveTtlDays: 7,
    outputRatioTarget: 0.2,
    lastSettleDate: null
  };

  const VIEWS = ['dashboard', 'inbox', 'process', 'shards', 'outputs', 'review'];

  const SHARDS = ['work_core', 'tech_trend', 'career', 'archive'];
  const SHARD_LABELS = {
    work_core: '核心工作',
    tech_trend: '技术趋势',
    career: '职业发展',
    archive: '归档'
  };

  const SOURCE_ICONS = {
    twitter: '\ud83d\udc26',
    wechat: '\ud83d\udcf0',
    paper: '\ud83d\udcdd',
    group: '\ud83d\udc65',
    other: '\ud83d\udccc'
  };
  const SOURCE_LABELS = {
    twitter: 'Twitter',
    wechat: '公众号',
    paper: '论文',
    group: '群聊',
    other: '其他'
  };

  /* ======================= Utilities ======================= */
  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function todayString() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function dateFromString(s) {
    var parts = s.split('-');
    return new Date(+parts[0], +parts[1] - 1, +parts[2]);
  }

  function daysSince(dateStr) {
    var then = dateFromString(dateStr);
    var now = dateFromString(todayString());
    return Math.round((now - then) / (1000 * 60 * 60 * 24));
  }

  function formatDate(isoStr) {
    if (!isoStr) return '—';
    var d = new Date(isoStr);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var h = String(d.getHours()).padStart(2, '0');
    var min = String(d.getMinutes()).padStart(2, '0');
    return y + '-' + m + '-' + day + ' ' + h + ':' + min;
  }

  function formatDateShort(isoStr) {
    if (!isoStr) return '—';
    var d = new Date(isoStr);
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return m + '-' + day;
  }

  /* --- URL Normalization & Hashing --- */
  var TRACKING_PARAMS = /(?:utm_source|utm_medium|utm_campaign|utm_term|utm_content|from|spm|fbclid|gclid|ref|source|si)=[^&]*/g;

  function normalizeUrl(url) {
    try {
      var u = new URL(url);
      // Lowercase hostname
      u.hostname = u.hostname.toLowerCase();
      // Remove tracking params
      u.search = u.search.replace(TRACKING_PARAMS, '').replace(/^&/, '').replace(/&&/g, '&');
      // Remove trailing slash
      var path = u.pathname.replace(/\/+$/, '');
      if (path === '') path = '/';
      u.pathname = path;
      return u.href;
    } catch(e) {
      return url.trim().toLowerCase().replace(/\/+$/, '');
    }
  }

  function hashCode(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + ch;
      hash = hash & hash;
    }
    return 'h' + Math.abs(hash).toString(36);
  }

  function hashUrl(url) {
    return hashCode(normalizeUrl(url));
  }

  /* ======================= Data Layer ======================= */
  function readJSON(key, fallback) {
    try {
      var val = localStorage.getItem(key);
      return val ? JSON.parse(val) : fallback;
    } catch(e) { return fallback; }
  }

  function writeJSON(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  function getItems() { return readJSON(KEYS.items, []); }
  function saveItems(items) { writeJSON(KEYS.items, items); scheduleSync(); }

  function getOutputs() { return readJSON(KEYS.outputs, []); }
  function saveOutputs(outputs) { writeJSON(KEYS.outputs, outputs); scheduleSync(); }

  function getSettings() {
    var s = readJSON(KEYS.settings, null);
    if (!s) {
      s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      saveSettings(s);
    }
    return s;
  }
  function saveSettings(s) { writeJSON(KEYS.settings, s); scheduleSync(); }

  function getDailyLog() { return readJSON(KEYS.dailyLog, []); }
  function saveDailyLog(log) { writeJSON(KEYS.dailyLog, log); scheduleSync(); }

  /* ======================= Gist Sync Layer ======================= */
  function getSyncConfig() {
    return {
      token: localStorage.getItem(SYNC_KEYS.token) || '',
      gistId: localStorage.getItem(SYNC_KEYS.gistId) || ''
    };
  }

  function saveSyncConfig(token, gistId) {
    localStorage.setItem(SYNC_KEYS.token, token);
    localStorage.setItem(SYNC_KEYS.gistId, gistId);
  }

  function isSyncConfigured() {
    var cfg = getSyncConfig();
    return cfg.token.length > 0 && cfg.gistId.length > 0;
  }

  function getAllData() {
    return {
      items: getItems(),
      outputs: getOutputs(),
      settings: getSettings(),
      dailyLog: getDailyLog()
    };
  }

  function loadAllData(data) {
    if (data.items) saveItems(data.items);
    if (data.outputs) saveOutputs(data.outputs);
    if (data.settings) saveSettings(data.settings);
    if (data.dailyLog) saveDailyLog(data.dailyLog);
  }

  var _syncTimer = null;

  function scheduleSync() {
    if (!isSyncConfigured()) return;
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(pushToGist, 500);
  }

  function pushToGist() {
    var cfg = getSyncConfig();
    if (!cfg.token || !cfg.gistId) return;

    var data = getAllData();
    var content = JSON.stringify(data, null, 2);
    var payload = {
      description: '认知网关 - ' + todayString(),
      files: {}
    };
    payload.files[GIST_FILENAME] = { content: content };

    var xhr = new XMLHttpRequest();
    xhr.open('PATCH', 'https://api.github.com/gists/' + cfg.gistId, true);
    xhr.setRequestHeader('Authorization', 'token ' + cfg.token);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/vnd.github.v3+json');

    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        console.log('[GistSync] Push OK');
      } else {
        console.warn('[GistSync] Push failed:', xhr.status, xhr.responseText);
      }
    };
    xhr.onerror = function() {
      console.warn('[GistSync] Push network error');
    };

    xhr.send(JSON.stringify(payload));
  }

  function pullFromGist(callback) {
    var cfg = getSyncConfig();
    if (!cfg.token || !cfg.gistId) {
      if (callback) callback(false);
      return;
    }

    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://api.github.com/gists/' + cfg.gistId, true);
    xhr.setRequestHeader('Authorization', 'token ' + cfg.token);
    xhr.setRequestHeader('Accept', 'application/vnd.github.v3+json');

    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var gist = JSON.parse(xhr.responseText);
          var file = gist.files[GIST_FILENAME];
          if (file && file.content) {
            var data = JSON.parse(file.content);
            loadAllData(data);
            if (callback) callback(true);
            return;
          }
        } catch(e) {
          console.warn('[GistSync] Parse failed:', e);
        }
      }
      if (callback) callback(false);
    };
    xhr.onerror = function() {
      console.warn('[GistSync] Pull network error');
      if (callback) callback(false);
    };

    xhr.send();
  }

  function updateSyncStatus() {
    var el = document.getElementById('sync-status');
    if (!el) return;
    if (isSyncConfigured()) {
      el.textContent = '⚡ 云端同步已开启';
      el.style.color = 'var(--accent)';
    } else {
      el.textContent = 'ℹ️ 数据仅存储在本地浏览器';
      el.style.color = 'var(--ink-muted)';
    }
  }

  /* ======================= Algorithms ======================= */
  function getTodayQuotaUsed() {
    var items = getItems();
    var today = todayString();
    var deep = 0, skim = 0;
    items.forEach(function(item) {
      if (item.status === 'processed' && item.processedAt) {
        var d = item.processedAt.slice(0, 10);
        if (d === today) {
          if (item.readType === 'deep') deep++;
          else if (item.readType === 'skim') skim++;
        }
      }
    });
    return { deep: deep, skim: skim };
  }

  function isSettledToday() {
    var settings = getSettings();
    return settings.lastSettleDate === todayString();
  }

  function computeConversionRate() {
    var items = getItems();
    var outputs = getOutputs();
    var today = todayString();
    var sevenDaysAgo = dateFromString(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    var cutoff = sevenDaysAgo.toISOString().slice(0, 10);

    var processedCount = 0;
    items.forEach(function(item) {
      if (item.status === 'processed' && item.processedAt && item.processedAt.slice(0, 10) >= cutoff) {
        processedCount++;
      }
    });

    var outputCount = 0;
    outputs.forEach(function(o) {
      if (o.createdAt && o.createdAt.slice(0, 10) >= cutoff) {
        outputCount++;
      }
    });

    return { processedCount: processedCount, outputCount: outputCount,
             rate: processedCount > 0 ? outputCount / processedCount : null };
  }

  function getReviewCandidates() {
    var items = getItems();
    var settings = getSettings();
    var ttl = settings.archiveTtlDays;
    var candidates = [];
    items.forEach(function(item) {
      if (item.shard !== 'archive') return;
      if (!item.lastReviewedAt || daysSince(item.lastReviewedAt.slice(0, 10)) > ttl) {
        candidates.push(item);
      }
    });
    return candidates;
  }

  function getStreak() {
    var log = getDailyLog();
    if (log.length === 0) return 0;
    var sorted = log.slice().sort(function(a, b) { return b.date < a.date ? -1 : b.date > a.date ? 1 : 0; });
    var streak = 0;
    var checkDate = dateFromString(todayString());
    for (var i = 0; i < sorted.length; i++) {
      var logDate = dateFromString(sorted[i].date);
      var diff = Math.round((checkDate - logDate) / (1000*60*60*24));
      if (diff === streak) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  /* ======================= DOM & Routing ======================= */
  var $ = function(id) { return document.getElementById(id); };

  function showView(name) {
    VIEWS.forEach(function(v) {
      var el = $(v + '-view');
      if (el) el.classList.toggle('active', v === name);
    });
    document.querySelectorAll('.app-nav a').forEach(function(a) {
      a.classList.toggle('active', a.dataset.view === name);
    });
    var renderFn = renderers[name];
    if (renderFn) renderFn();
  }

  function initRouting() {
    function onHashChange() {
      var hash = location.hash.replace('#', '') || 'dashboard';
      if (VIEWS.indexOf(hash) === -1) hash = 'dashboard';
      showView(hash);
    }
    window.addEventListener('hashchange', onHashChange);
    onHashChange();
  }

  /* ======================= Toast ======================= */
  function showToast(msg, isDanger) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast' + (isDanger ? ' toast-danger' : '');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function() { el.classList.remove('show'); }, 2500);
  }

  /* ======================= Modal helper ======================= */
  function openModal(html, onConfirm) {
    var overlay = $('modal-overlay');
    if (!overlay) return;
    overlay.innerHTML = '<div class="modal">' + html + '</div>';
    overlay.classList.add('open');

    var cancelBtn = overlay.querySelector('.btn-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function() { overlay.classList.remove('open'); });
    }

    var confirmBtn = overlay.querySelector('.btn-confirm');
    if (confirmBtn && onConfirm) {
      confirmBtn.addEventListener('click', function() {
        overlay.classList.remove('open');
        onConfirm();
      });
    }

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  }

  function closeModal() {
    var overlay = $('modal-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  /* ======================= Export / Import ======================= */
  function exportData() {
    var data = {
      items: getItems(),
      outputs: getOutputs(),
      settings: getSettings(),
      dailyLog: getDailyLog(),
      exportedAt: new Date().toISOString()
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'cognitive-gateway-backup-' + todayString() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('数据已导出');
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!data.items || !data.outputs || !data.settings || !data.dailyLog) {
          showToast('文件格式不完整', true);
          return;
        }
        saveItems(data.items);
        saveOutputs(data.outputs);
        saveSettings(data.settings);
        saveDailyLog(data.dailyLog);
        showToast('数据已导入成功');
        var hash = location.hash.replace('#', '') || 'dashboard';
        if (VIEWS.indexOf(hash) > -1) showView(hash);
      } catch(err) {
        showToast('导入失败：文件格式错误', true);
      }
    };
    reader.readAsText(file);
  }

  /* ======================= Renderers ======================= */
  var renderers = {};

  /* ---------- Quota Slots Component (shared) ---------- */
  function renderQuotaSlots(used, total, label) {
    var html = '<span class="quota-label">' + label + '</span>';
    for (var i = 0; i < total; i++) {
      html += '<span class="slot' + (i < used ? ' filled' : '') + '"></span>';
    }
    html += '<span class="quota-label" style="min-width:auto;margin-left:4px;">' + used + '/' + total + '</span>';
    return html;
  }

  function renderQuotaSummary() {
    var settings = getSettings();
    var used = getTodayQuotaUsed();
    return {
      deepHtml: renderQuotaSlots(used.deep, settings.dailyQuota.deep, '深度'),
      skimHtml: renderQuotaSlots(used.skim, settings.dailyQuota.skim, '扫读'),
      deepUsed: used.deep,
      skimUsed: used.skim,
      deepTotal: settings.dailyQuota.deep,
      skimTotal: settings.dailyQuota.skim
    };
  }

  /* ---------- Dashboard ---------- */
  renderers.dashboard = function() {
    var settings = getSettings();
    var used = getTodayQuotaUsed();
    var rateData = computeConversionRate();
    var streak = getStreak();
    var items = getItems();
    var allProcessed = items.filter(function(i) { return i.status === 'processed'; });
    var archiveCount = items.filter(function(i) { return i.status === 'processed' && i.shard === 'archive'; }).length;

    var quotaHtml = '<div class="quota-summary">';
    quotaHtml += '<div class="quota-block">' + renderQuotaSlots(used.deep, settings.dailyQuota.deep, '深度') + '</div>';
    quotaHtml += '<div class="quota-block">' + renderQuotaSlots(used.skim, settings.dailyQuota.skim, '扫读') + '</div>';
    quotaHtml += '</div>';

    $('dashboard-quota').innerHTML = quotaHtml;

    var settled = isSettledToday();
    $('settle-btn').textContent = settled ? '\u2713 今日已结算' : '\u26A0\uFE0F 执行日切';
    $('settle-btn').disabled = settled;
    $('settle-btn').className = 'btn' + (settled ? '' : ' btn-danger');

    var rateDisplay = rateData.rate !== null
      ? Math.round(rateData.rate * 100) + '%'
      : '暂无数据';
    var rateClass = rateData.rate !== null
      ? (rateData.rate >= settings.outputRatioTarget ? 'ok' : 'warn')
      : '';
    var archiveRatio = allProcessed.length > 0
      ? Math.round(archiveCount / allProcessed.length * 100) + '%'
      : '暂无数据';

    $('stat-rate').textContent = rateDisplay;
    $('stat-rate').className = 'stat-value ' + rateClass;
    $('stat-archive').textContent = archiveRatio;
    $('stat-streak').textContent = streak + ' 天';

    renderTrendChart();
  };

  function renderTrendChart() {
    var log = getDailyLog();
    var container = $('trend-chart');
    if (!container) return;

    var sorted = log.slice().sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var recent = sorted.slice(-14);

    if (recent.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>暂无数据</p><p style="font-size:0.75rem;">完成日切后，趋势图将自动生成</p></div>';
      return;
    }

    var maxVal = 1;
    recent.forEach(function(d) {
      if (d.inboxCount > maxVal) maxVal = d.inboxCount;
      if (d.outputCount > maxVal) maxVal = d.outputCount;
    });
    maxVal = Math.ceil(maxVal * 1.2);

    var w = 600, h = 160;
    var pad = { top: 12, right: 12, bottom: 28, left: 32 };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    var bars = [];
    recent.forEach(function(d, i) {
      var x = pad.left + (i + 0.5) * (plotW / Math.max(recent.length, 1));
      var inH = (d.inboxCount / maxVal) * plotH;
      var outH = (d.outputCount / maxVal) * plotH;
      bars.push({ x: x, inH: inH, outH: outH, date: d.date.slice(5), inbox: d.inboxCount, output: d.outputCount });
    });

    var labelStep = Math.max(1, Math.floor(recent.length / 7));

    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" class="chart-svg">';
    for (var g = 0; g <= 4; g++) {
      var gy = pad.top + (g / 4) * plotH;
      var gval = Math.round(maxVal - (g / 4) * maxVal);
      svg += '<line x1="' + pad.left + '" y1="' + gy + '" x2="' + (w - pad.right) + '" y2="' + gy + '" stroke="#E4DDD0" stroke-width="0.5"/>';
      svg += '<text x="' + (pad.left - 6) + '" y="' + (gy + 3) + '" fill="#8A8377" font-family="var(--font-mono)" font-size="9" text-anchor="end">' + gval + '</text>';
    }
    svg += '<polyline fill="none" stroke="#8A8377" stroke-width="1.5" stroke-linejoin="round" points="';
    bars.forEach(function(b, i) {
      svg += (i > 0 ? ' ' : '') + b.x + ',' + (pad.top + plotH - b.inH);
    });
    svg += '"/>';
    bars.forEach(function(b) {
      svg += '<circle cx="' + b.x + '" cy="' + (pad.top + plotH - b.inH) + '" r="3" fill="#8A8377"/>';
    });
    var barW = Math.min(12, plotW / recent.length * 0.4);
    bars.forEach(function(b) {
      if (b.outH > 0) {
        svg += '<rect x="' + (b.x - barW/2) + '" y="' + (pad.top + plotH - b.outH) + '" width="' + barW + '" height="' + b.outH + '" fill="#3D5A56" rx="2"/>';
      }
    });
    bars.forEach(function(b, i) {
      if (i % labelStep === 0 || i === bars.length - 1) {
        svg += '<text x="' + b.x + '" y="' + (h - 6) + '" fill="#8A8377" font-family="var(--font-mono)" font-size="9" text-anchor="middle">' + b.date + '</text>';
      }
    });
    svg += '<circle cx="' + (w - 90) + '" cy="' + (pad.top + 6) + '" r="3" fill="#8A8377"/>';
    svg += '<text x="' + (w - 82) + '" y="' + (pad.top + 10) + '" fill="#8A8377" font-family="var(--font-sans)" font-size="9">输入</text>';
    svg += '<rect x="' + (w - 48) + '" y="' + (pad.top + 3) + '" width="8" height="8" fill="#3D5A56" rx="1"/>';
    svg += '<text x="' + (w - 36) + '" y="' + (pad.top + 10) + '" fill="#8A8377" font-family="var(--font-sans)" font-size="9">输出</text>';
    svg += '</svg>';
    container.innerHTML = svg;
  }

  /* ---------- Inbox ---------- */
  renderers.inbox = function() {
    var items = getItems();
    var inboxItems = items.filter(function(i) { return i.status === 'inbox'; });

    var listHtml = '';
    if (inboxItems.length === 0) {
      listHtml = '<div class="empty-state"><div class="empty-icon">\u2610</div><p>采集箱是空的</p><p style="font-size:0.75rem;">使用上方的表单添加内容</p></div>';
    } else {
      inboxItems.sort(function(a, b) { return b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0; });
      inboxItems.forEach(function(item) {
        listHtml += itemCardHtml(item);
      });
    }
    $('inbox-list').innerHTML = listHtml;
  };

  function itemCardHtml(item) {
    var icon = SOURCE_ICONS[item.source] || '\ud83d\udccc';
    var sourceLabel = SOURCE_LABELS[item.source] || item.source;
    var title = item.title || item.url;
    var urlDisplay = item.url.length > 60 ? item.url.slice(0, 60) + '...' : item.url;

    var html = '<div class="item-card" data-id="' + item.id + '">';
    html += '<div class="item-card-header">';
    html += '<span class="source-icon ' + item.source + '">' + icon + '</span>';
    html += '<div class="item-card-title">' + escapeHtml(title) + '</div>';
    html += '</div>';
    html += '<div class="item-card-url">' + escapeHtml(urlDisplay) + '</div>';
    if (item.note) {
      html += '<div class="item-card-note">\u201C' + escapeHtml(item.note) + '\u201D</div>';
    }
    html += '<div style="display:flex;gap:8px;align-items:center;margin-top:6px;">';
    html += '<span class="badge badge-' + item.status + '">' + item.status + '</span>';
    if (item.shard) {
      html += ' <span class="badge badge-shard-' + item.shard + '">' + SHARD_LABELS[item.shard] + '</span>';
    }
    if (item.readType) {
      html += ' <span class="badge badge-' + item.readType + '">' + (item.readType === 'deep' ? '深度' : '扫读') + '</span>';
    }
    html += '<span class="card-meta" style="margin-left:auto;">' + formatDate(item.createdAt) + '</span>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /* ---------- Process ---------- */
  renderers.process = function() {
    var items = getItems();
    var inboxItems = items.filter(function(i) { return i.status === 'inbox'; });
    var quota = renderQuotaSummary();

    $('process-quota').innerHTML = '<div class="quota-summary"><div class="quota-block">' + quota.deepHtml + '</div><div class="quota-block">' + quota.skimHtml + '</div></div>';

    var remaining = (quota.deepTotal - quota.deepUsed) + (quota.skimTotal - quota.skimUsed);
    if (remaining <= 0 && inboxItems.length > 0) {
      $('process-warning').innerHTML = '<div class="quota-over-line">\u26A0\uFE0F 今日配额已用完，剩余 ' + inboxItems.length + ' 条将在日切时自动清空\u2014\u2014限流规则不允许继续处理。</div>';
    } else {
      $('process-warning').innerHTML = '';
    }

    var listHtml = '';
    if (inboxItems.length === 0) {
      listHtml = '<div class="empty-state"><div class="empty-icon">\u2714\uFE0F</div><p>处理完毕！</p><p style="font-size:0.75rem;">今日所有内容已处理，去采集箱添加更多内容</p></div>';
    } else {
      inboxItems.sort(function(a, b) { return b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0; });
      inboxItems.forEach(function(item) {
        listHtml += processItemCardHtml(item, quota);
      });
    }
    $('process-list').innerHTML = listHtml;
  };

  function processItemCardHtml(item, quota) {
    var icon = SOURCE_ICONS[item.source] || '\ud83d\udcc4';
    var title = item.title || item.url;
    var urlDisplay = item.url.length > 60 ? item.url.slice(0, 60) + '...' : item.url;
    var deepDisabled = quota.deepUsed >= quota.deepTotal;
    var skimDisabled = quota.skimUsed >= quota.skimTotal;

    var html = '<div class="item-card" data-id="' + item.id + '">';
    html += '<div class="item-card-header">';
    html += '<span class="source-icon ' + item.source + '">' + icon + '</span>';
    html += '<div class="item-card-title">' + escapeHtml(title) + '</div>';
    html += '</div>';
    html += '<div class="item-card-url">' + escapeHtml(urlDisplay) + '</div>';
    if (item.note) {
      html += '<div class="item-card-note">\u201C' + escapeHtml(item.note) + '\u201D</div>';
    }
    html += '<div class="item-card-actions">';
    html += '<button class="btn btn-sm btn-mono process-deep" data-id="' + item.id + '"' + (deepDisabled ? ' disabled' : '') + '>深度\u2192</button>';
    html += '<button class="btn btn-sm btn-mono process-skim" data-id="' + item.id + '"' + (skimDisabled ? ' disabled' : '') + '>扫读\u2192</button>';
    html += '<button class="btn btn-sm btn-ghost process-drop" data-id="' + item.id + '" style="color:var(--signal-danger);">\u2715 丢弃</button>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  /* ---------- Shards ---------- */
  renderers.shards = function() {
    var hash = location.hash;
    var activeShard = sessionStorage.getItem('cg_active_shard') || 'work_core';

    var tabsHtml = '';
    SHARDS.forEach(function(s) {
      tabsHtml += '<span class="shard-tab' + (s === activeShard ? ' active' : '') + '" data-shard="' + s + '">' + SHARD_LABELS[s] + ' <span style="font-family:var(--font-mono);font-size:0.625rem;">' + s + '</span></span>';
    });
    $('shard-tabs').innerHTML = tabsHtml;

    var searchVal = ($('shard-search') && $('shard-search').value) || '';
    renderShardContent(activeShard, searchVal);
  };

  function renderShardContent(shard, search) {
    var items = getItems();
    var shardItems = items.filter(function(i) {
      return i.status === 'processed' && i.shard === shard;
    });

    if (search) {
      var q = search.toLowerCase();
      shardItems = shardItems.filter(function(i) {
        return (i.title && i.title.toLowerCase().indexOf(q) > -1) ||
               (i.note && i.note.toLowerCase().indexOf(q) > -1) ||
               (i.url && i.url.toLowerCase().indexOf(q) > -1);
      });
    }

    shardItems.sort(function(a, b) { return (b.processedAt || '') < (a.processedAt || '') ? -1 : 1; });

    var html = '';
    if (shardItems.length === 0) {
      html = '<div class="empty-state"><div class="empty-icon">\u2610</div><p>这个分片还没有内容</p></div>';
    } else {
      shardItems.forEach(function(item) {
        html += '<div class="card" data-id="' + item.id + '">';
        html += '<div class="card-title">' + escapeHtml(item.title || item.url) + '</div>';
        html += '<div style="display:flex;gap:8px;align-items:center;margin-top:4px;flex-wrap:wrap;">';
        html += '<span class="badge badge-shard-' + item.shard + '">' + SHARD_LABELS[item.shard] + '</span>';
        html += '<span class="badge badge-' + item.readType + '">' + (item.readType === 'deep' ? '深度' : '扫读') + '</span>';
        html += '<span class="card-meta">' + formatDate(item.processedAt) + '</span>';
        if (item.lastReviewedAt) {
          html += '<span class="card-meta">已回看 ' + formatDateShort(item.lastReviewedAt) + '</span>';
        }
        html += '</div>';
        html += '<div class="card-actions">';
        if (!item.lastReviewedAt) {
          html += '<button class="btn btn-sm btn-ghost btn-mono mark-reviewed" data-id="' + item.id + '">标记已回看</button>';
        } else {
          html += '<button class="btn btn-sm btn-ghost btn-mono" disabled>\u2713 已回看</button>';
        }
        html += '</div>';
        html += '</div>';
      });
    }
    $('shard-content').innerHTML = html;
  }

  /* ---------- Outputs ---------- */
  renderers.outputs = function() {
    var outputs = getOutputs();
    outputs.sort(function(a, b) { return (b.createdAt || '') < (a.createdAt || '') ? -1 : 1; });

    var html = '';
    if (outputs.length === 0) {
      html = '<div class="empty-state"><div class="empty-icon">\u270F\uFE0F</div><p>还没有产出记录</p><p style="font-size:0.75rem;">点击上方按钮记录你的第一个输出</p></div>';
    } else {
      outputs.forEach(function(o) {
        var typeLabels = { code: '\ud83d\udcbb 代码', article: '\ud83d\udcdd 文章', share: '\ud83d\udde3\uFE0F 分享', mindmap: '\ud83e\udde0 思维导图', other: '\ud83d\udccc 其他' };
        html += '<div class="output-card">';
        html += '<div class="output-title">' + escapeHtml(o.title) + '</div>';
        html += '<div class="output-meta">' + (typeLabels[o.type] || o.type) + ' \u00B7 ' + formatDate(o.createdAt);
        if (o.link) html += ' \u00B7 <a href="' + escapeHtml(o.link) + '" target="_blank" style="color:var(--accent);text-decoration:underline;">链接</a>';
        if (o.sourceItemIds && o.sourceItemIds.length > 0) {
          html += ' \u00B7 关联 ' + o.sourceItemIds.length + ' 条来源';
        }
        html += '</div>';
        html += '</div>';
      });
    }
    $('outputs-list').innerHTML = html;
  };

  /* ---------- Review ---------- */
  renderers.review = function() {
    var candidates = getReviewCandidates();

    if (candidates.length === 0) {
      $('review-list').innerHTML = '<div class="empty-state"><div class="empty-icon">\u2728</div><p>没有需要退款的归档内容</p><p style="font-size:0.75rem;">所有归档内容最近都有回看</p></div>';
      $('review-actions').innerHTML = '';
      return;
    }

    var html = '';
    candidates.forEach(function(item) {
      html += '<div class="review-item">';
      html += '<input type="checkbox" class="review-check" data-id="' + item.id + '" id="rc-' + item.id + '">';
      html += '<div style="flex:1;">';
      html += '<div class="card-title" style="font-size:0.875rem;">' + escapeHtml(item.title || item.url) + '</div>';
      html += '<div class="card-meta">归档于 ' + formatDate(item.processedAt);
      if (item.lastReviewedAt) html += ' \u00B7 上次回看 ' + formatDateShort(item.lastReviewedAt) + ' (' + daysSince(item.lastReviewedAt.slice(0, 10)) + ' 天前)';
      else html += ' \u00B7 从未回看';
      html += '</div>';
      html += '</div>';
      html += '</div>';
    });
    $('review-list').innerHTML = html;

    $('review-actions').innerHTML = '<button class="btn btn-sm" id="review-select-all">全选</button>' +
      '<button class="btn btn-danger btn-mono" id="review-delete-selected" disabled>\u2715 批量删除（认知退款）</button>' +
      '<span class="card-meta" id="review-count">已选 0 / ' + candidates.length + '</span>';
  };

  /* ======================= Event Bindings ======================= */
  function initEvents() {
    document.querySelectorAll('.app-nav a').forEach(function(a) {
      a.addEventListener('click', function(e) {
        e.preventDefault();
        location.hash = '#' + this.dataset.view;
      });
    });

    $('inbox-add-btn').addEventListener('click', addInboxItem);
    $('inbox-url').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') addInboxItem();
    });

    $('inbox-reset-btn').addEventListener('click', function() {
      $('inbox-url').value = '';
      $('inbox-source').value = 'twitter';
      $('inbox-note').value = '';
      $('inbox-url').focus();
    });

    $('process-list').addEventListener('click', function(e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var id = btn.dataset.id;
      if (!id) return;

      if (btn.classList.contains('process-deep')) {
        handleProcessItem(id, 'deep');
      } else if (btn.classList.contains('process-skim')) {
        handleProcessItem(id, 'skim');
      } else if (btn.classList.contains('process-drop')) {
        dropItem(id);
      }
    });

    $('shard-tabs').addEventListener('click', function(e) {
      var tab = e.target.closest('.shard-tab');
      if (!tab) return;
      var shard = tab.dataset.shard;
      if (!shard) return;
      sessionStorage.setItem('cg_active_shard', shard);
      document.querySelectorAll('.shard-tab').forEach(function(t) {
        t.classList.toggle('active', t.dataset.shard === shard);
      });
      renderShardContent(shard, ($('shard-search') && $('shard-search').value) || '');
    });

    $('shard-search').addEventListener('input', function() {
      var activeShard = sessionStorage.getItem('cg_active_shard') || 'work_core';
      renderShardContent(activeShard, this.value);
    });

    $('shard-content').addEventListener('click', function(e) {
      var btn = e.target.closest('.mark-reviewed');
      if (!btn) return;
      var id = btn.dataset.id;
      if (!id) return;
      markReviewed(id);
    });

    $('output-add-btn').addEventListener('click', openOutputForm);

    $('review-list').addEventListener('change', updateReviewCount);

    $('review-actions').addEventListener('click', function(e) {
      if (e.target.id === 'review-select-all') {
        document.querySelectorAll('.review-check').forEach(function(cb) {
          cb.checked = true;
        });
        updateReviewCount();
      } else if (e.target.id === 'review-delete-selected') {
        var checked = document.querySelectorAll('.review-check:checked');
        if (checked.length === 0) return;
        openModal(
          '<div class="modal-title">确认认知退款</div>' +
          '<p style="font-size:0.875rem;color:var(--ink-muted);margin-bottom:16px;">将从 <code style="font-family:var(--font-mono);background:var(--paper-bg);padding:1px 6px;border-radius:3px;">archive</code> 分片中永久删除 <strong>' + checked.length + '</strong> 条条目。此操作不可撤销。</p>' +
          '<div class="modal-actions"><button class="btn btn-cancel">取消</button><button class="btn btn-danger btn-confirm">确认退款</button></div>',
          function() {
            deleteReviewCandidates();
          }
        );
      }
    });

    $('settle-btn').addEventListener('click', handleSettle);

    $('export-btn').addEventListener('click', exportData);
    $('import-btn').addEventListener('click', function() {
      $('import-file-input').click();
    });
    $('import-file-input').addEventListener('change', function(e) {
      if (e.target.files.length > 0) {
        importData(e.target.files[0]);
        e.target.value = '';
      }
    });
    $('sync-settings-btn').addEventListener('click', openSyncSettings);
  }

  /* ======================= Sync Settings Modal ======================= */
  function openSyncSettings() {
    var cfg = getSyncConfig();
    var html = '<div class="modal-title">&#x2699; 云端同步设置</div>' +
      '<p style="font-size:0.8125rem;color:var(--ink-muted);margin-bottom:16px;line-height:1.5;">' +
      '配置 GitHub Gist 后可跨设备同步数据。需要先<a href="https://github.com/settings/tokens" target="_blank" style="color:var(--accent);">创建一个 Token</a>（勾选 <code style="font-family:var(--font-mono);background:var(--paper-bg);padding:1px 6px;border-radius:3px;">gist</code> 权限），' +
      '并<a href="https://gist.github.com/" target="_blank" style="color:var(--accent);">新建一个空的私有 Gist</a>，复制 Gist ID（URL 中 <code style="font-family:var(--font-mono);background:var(--paper-bg);padding:1px 6px;border-radius:3px;">/gist/用户名/xxxxx</code> 的 xxxxx 部分）。</p>' +
      '<div class="form-group"><label>GitHub Token</label>' +
      '<input type="password" class="form-input" id="sync-token-input" value="' + escapeHtml(cfg.token) + '" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"></div>' +
      '<div class="form-group"><label>Gist ID</label>' +
      '<input class="form-input" id="sync-gist-input" value="' + escapeHtml(cfg.gistId) + '" placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"></div>' +
      '<div class="modal-actions">' +
      '<button class="btn btn-cancel" onclick="closeModal()">取消</button>' +
      (isSyncConfigured() ? '<button class="btn btn-ghost" id="sync-clear-btn">清除配置</button>' : '') +
      '<button class="btn btn-primary" id="sync-save-btn">保存</button></div>';

    openModal(html, null);

    var overlay = document.getElementById('modal-overlay');
    var saveBtn = overlay.querySelector('#sync-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        var token = overlay.querySelector('#sync-token-input').value.trim();
        var gistId = overlay.querySelector('#sync-gist-input').value.trim();
        if (!token || !gistId) {
          showToast('请填写 Token 和 Gist ID', true);
          return;
        }
        saveSyncConfig(token, gistId);
        closeModal();
        showToast('同步配置已保存');
        updateSyncStatus();
        // Try a pull to verify the token works
        pullFromGist(function(success) {
          if (success) {
            showToast('验证成功，已从云端同步数据');
            var hash = location.hash.replace('#', '') || 'dashboard';
            if (VIEWS.indexOf(hash) > -1) showView(hash);
          }
        });
      });
    }

    var clearBtn = overlay.querySelector('#sync-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        saveSyncConfig('', '');
        closeModal();
        showToast('同步配置已清除');
        updateSyncStatus();
      });
    }
  }

  /* ======================= Action Handlers ======================= */
  function addInboxItem() {
    var urlInput = $('inbox-url');
    var sourceSelect = $('inbox-source');
    var noteInput = $('inbox-note');

    var url = urlInput.value.trim();
    if (!url) {
      showToast('请输入 URL', true);
      urlInput.focus();
      return;
    }

    var source = sourceSelect.value;
    var note = noteInput.value.trim();
    var urlHash = hashUrl(url);

    var items = getItems();
    var existing = items.filter(function(i) { return i.urlHash === urlHash && i.status !== 'dropped'; });
    if (existing.length > 0) {
      if (!confirm('此内容已存在（来源：' + SOURCE_LABELS[existing[0].source] + '），是否仍要添加？')) {
        urlInput.value = '';
        urlInput.focus();
        return;
      }
    }

    var newItem = {
      id: generateId(),
      url: url,
      title: '',
      source: source,
      note: note,
      createdAt: new Date().toISOString(),
      status: 'inbox',
      readType: null,
      shard: null,
      processedAt: null,
      urlHash: urlHash,
      lastReviewedAt: null
    };

    items.push(newItem);
    saveItems(items);
    showToast('已加入采集箱');

    urlInput.value = '';
    noteInput.value = '';
    urlInput.focus();

    renderers.inbox();
  }

  function handleProcessItem(id, readType) {
    var shardOptions = SHARDS.map(function(s) {
      return '<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;font-size:0.875rem;">' +
        '<input type="radio" name="process-shard" value="' + s + '"' + (s === 'work_core' ? ' checked' : '') + '>' +
        SHARD_LABELS[s] + ' <span style="font-family:var(--font-mono);font-size:0.75rem;color:var(--ink-muted);">' + s + '</span></label>';
    }).join('');

    var typeLabel = readType === 'deep' ? '深度阅读' : '扫读';

    openModal(
      '<div class="modal-title">' + typeLabel + ' \u2014 选择分片</div>' +
      '<div style="margin-bottom:16px;">' + shardOptions + '</div>' +
      '<div class="modal-actions"><button class="btn btn-cancel">取消</button><button class="btn btn-primary btn-confirm">确认</button></div>',
      function() {
        var selected = document.querySelector('input[name="process-shard"]:checked');
        if (!selected) return;
        processItem(id, readType, selected.value);
      }
    );
  }

  function processItem(id, readType, shard) {
    var items = getItems();
    var found = false;
    items = items.map(function(item) {
      if (item.id === id) {
        found = true;
        item.status = 'processed';
        item.readType = readType;
        item.shard = shard;
        item.processedAt = new Date().toISOString();
      }
      return item;
    });
    if (found) {
      saveItems(items);
      showToast(readType === 'deep' ? '已深度处理' : '已扫读处理');
      renderers.process();
    }
  }

  function dropItem(id) {
    if (!confirm('确定丢弃此条目？')) return;
    var items = getItems();
    items = items.map(function(item) {
      if (item.id === id) {
        item.status = 'dropped';
        item.processedAt = new Date().toISOString();
      }
      return item;
    });
    saveItems(items);
    showToast('已丢弃');
    renderers.process();
    var hash = location.hash.replace('#', '');
    if (hash === 'inbox') renderers.inbox();
  }

  function markReviewed(id) {
    var items = getItems();
    items = items.map(function(item) {
      if (item.id === id) {
        item.lastReviewedAt = new Date().toISOString();
      }
      return item;
    });
    saveItems(items);
    showToast('已标记为已回看');
    renderShardContent(
      sessionStorage.getItem('cg_active_shard') || 'work_core',
      ($('shard-search') && $('shard-search').value) || ''
    );
  }

  function openOutputForm() {
    var typeOptions = [
      { value: 'code', label: '\ud83d\udcbb 代码' },
      { value: 'article', label: '\ud83d\udcdd 文章' },
      { value: 'share', label: '\ud83d\udde3\uFE0F 分享' },
      { value: 'mindmap', label: '\ud83e\udde0 思维导图' },
      { value: 'other', label: '\ud83d\udccc 其他' }
    ];
    var typeHtml = typeOptions.map(function(o) {
      return '<option value="' + o.value + '">' + o.label + '</option>';
    }).join('');

    var items = getItems().filter(function(i) { return i.status === 'processed'; });
    var sourcesHtml = '';
    if (items.length > 0) {
      sourcesHtml = '<div class="form-group"><label>关联信息来源（可选）</label>' +
        '<div class="select-list">';
      items.slice(0, 30).forEach(function(item) {
        sourcesHtml += '<label><input type="checkbox" class="output-source-item" value="' + item.id + '">' +
          escapeHtml((item.title || item.url).slice(0, 50)) + '</label>';
      });
      if (items.length > 30) {
        sourcesHtml += '<p style="font-size:0.75rem;color:var(--ink-muted);padding:4px 8px;">（仅显示最近 30 条）</p>';
      }
      sourcesHtml += '</div></div>';
    }

    openModal(
      '<div class="modal-title">记录产出</div>' +
      '<div class="form-group"><label>输出类型</label><select id="output-form-type" class="form-select">' + typeHtml + '</select></div>' +
      '<div class="form-group"><label>标题</label><input id="output-form-title" class="form-input" placeholder="输出标题"></div>' +
      '<div class="form-group"><label>链接（选填）</label><input id="output-form-link" class="form-input" placeholder="https://..."></div>' +
      sourcesHtml +
      '<div class="modal-actions"><button class="btn btn-cancel">取消</button><button class="btn btn-primary btn-confirm">保存</button></div>',
      function() {
        var title = document.getElementById('output-form-title').value.trim();
        if (!title) { showToast('请输入标题', true); return; }
        var type = document.getElementById('output-form-type').value;
        var link = document.getElementById('output-form-link').value.trim();
        var sourceIds = [];
        document.querySelectorAll('.output-source-item:checked').forEach(function(cb) {
          sourceIds.push(cb.value);
        });

        var output = {
          id: generateId(),
          createdAt: new Date().toISOString(),
          type: type,
          title: title,
          link: link || '',
          sourceItemIds: sourceIds
        };
        var outputs = getOutputs();
        outputs.push(output);
        saveOutputs(outputs);
        showToast('产出已记录');
        renderers.outputs();
      }
    );
  }

  function handleSettle() {
    if (isSettledToday()) {
      showToast('今日已结算');
      return;
    }

    var items = getItems();
    var inboxItems = items.filter(function(i) { return i.status === 'inbox'; });
    var processedToday = items.filter(function(i) {
      return i.status === 'processed' && i.processedAt && i.processedAt.slice(0, 10) === todayString();
    });
    var droppedToday = items.filter(function(i) {
      return (i.status === 'dropped' && i.processedAt && i.processedAt.slice(0, 10) === todayString());
    });

    var stats = {
      processed: processedToday.length,
      dropped: droppedToday.length,
      remaining: inboxItems.length,
      deepUsed: getTodayQuotaUsed().deep,
      skimUsed: getTodayQuotaUsed().skim
    };

    openModal(
      '<div class="modal-title">\u26A0\uFE0F 执行日切结算</div>' +
      '<p style="font-size:0.875rem;color:var(--ink-muted);margin-bottom:12px;">日切后将归档今日数据，未处理的 ' + stats.remaining + ' 条将被自动丢弃。此操作不可撤销。</p>' +
      '<table class="settle-summary-table">' +
      '<tr><td>深度处理</td><td>' + stats.deepUsed + '</td></tr>' +
      '<tr><td>扫读处理</td><td>' + stats.skimUsed + '</td></tr>' +
      '<tr><td>已丢弃</td><td>' + stats.dropped + '</td></tr>' +
      '<tr><td>待处理（将丢弃）</td><td>' + stats.remaining + '</td></tr>' +
      '</table>' +
      '<div class="modal-actions"><button class="btn btn-cancel">取消</button><button class="btn btn-danger btn-confirm">确认日切</button></div>',
      function() {
        executeSettle(stats);
      }
    );
  }

  function executeSettle(stats) {
    var items = getItems();
    items = items.map(function(item) {
      if (item.status === 'inbox') {
        item.status = 'dropped';
        item.processedAt = new Date().toISOString();
      }
      return item;
    });
    saveItems(items);

    var log = getDailyLog();
    var outputs = getOutputs();
    var todayOutputs = outputs.filter(function(o) {
      return o.createdAt && o.createdAt.slice(0, 10) === todayString();
    });

    log.push({
      date: todayString(),
      inboxCount: stats.processed + stats.remaining + stats.dropped,
      processedCount: stats.processed,
      droppedCount: stats.dropped + stats.remaining,
      deepUsed: stats.deepUsed,
      skimUsed: stats.skimUsed,
      outputCount: todayOutputs.length
    });
    saveDailyLog(log);

    var settings = getSettings();
    settings.lastSettleDate = todayString();
    saveSettings(settings);

    showToast('\u2705 日切完成！今天处理 ' + stats.processed + ' 条，丢弃 ' + (stats.dropped + stats.remaining) + ' 条，产出 ' + todayOutputs.length + ' 篇');
    renderers.dashboard();
  }

  function updateReviewCount() {
    var checked = document.querySelectorAll('.review-check:checked').length;
    var total = document.querySelectorAll('.review-check').length;
    var countEl = document.getElementById('review-count');
    var deleteBtn = document.getElementById('review-delete-selected');
    if (countEl) countEl.textContent = '已选 ' + checked + ' / ' + total;
    if (deleteBtn) deleteBtn.disabled = checked === 0;
  }

  function deleteReviewCandidates() {
    var checked = document.querySelectorAll('.review-check:checked');
    var ids = [];
    checked.forEach(function(cb) { ids.push(cb.dataset.id); });

    if (ids.length === 0) return;

    var items = getItems();
    items = items.filter(function(item) {
      return ids.indexOf(item.id) === -1;
    });
    saveItems(items);
    showToast('已永久删除 ' + ids.length + ' 条归档内容');
    renderers.review();
  }

  /* ======================= Init ======================= */
  function init() {
    getSettings();
    initRouting();
    initEvents();

    var select = $('inbox-source');
    if (select) {
      var opts = select.querySelectorAll('option');
      opts.forEach(function(o) {
        if (SOURCE_LABELS[o.value]) o.textContent = SOURCE_LABELS[o.value];
      });
    }

    updateSyncStatus();

    // Pull from Gist on load if configured
    if (isSyncConfigured()) {
      pullFromGist(function(success) {
        if (success) {
          var hash = location.hash.replace('#', '') || 'dashboard';
          if (VIEWS.indexOf(hash) > -1) showView(hash);
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
