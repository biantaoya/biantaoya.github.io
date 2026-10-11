// ================================================================
// 符文大乱斗 · 英雄属性查询
// 数据来自 heroes.json；所有文案都用 textContent 写入，
// 所以 Excel 里出现 < > ' 之类的字符不会再破坏页面结构。
// ================================================================

// 头像目录：96x96 WebP，由图标构建脚本从原始 PNG 生成
const ICON_DIR = './champions/';
const FALLBACK_ICON = 'https://ddragon.leagueoflegends.com/cdn/14.10.1/img/champion/default.png';

// ================================================================
// 全局状态
// ================================================================
let heroes = [];
const heroByName = new Map();
let currentType = 'all';
let searchText = '';
let renderFrame = null;

// ================================================================
// DOM 引用
// ================================================================
const searchInput = document.getElementById('searchInput');
const clearBtn = document.getElementById('clearBtn');
const resultCount = document.getElementById('resultCount');
const matchInfo = document.getElementById('matchInfo');
const grid = document.getElementById('heroGrid');
const noResult = document.getElementById('noResult');
const typeButtons = Array.from(document.querySelectorAll('#typeFilter button'));
const versionBadge = document.getElementById('versionBadge');
const dataVersions = document.getElementById('dataVersions');
const allRemarksBtn = document.getElementById('allRemarksBtn');
const resetBtn = document.getElementById('resetBtn');
const pageContainer = document.querySelector('.container');
const modalOverlay = document.getElementById('remarkModal');
const modal = modalOverlay.querySelector('.modal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const fontCss = document.getElementById('fontCss');

// Inter 先以 media=print 低优先级加载（见 index.html），这里再启用它。
// 拿不到字体时页面也不会因此延迟渲染。
if (fontCss) fontCss.media = 'all';

// ================================================================
// 小工具
// ================================================================

/** 建节点。文本一律走 textContent，不解析成 HTML。 */
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
}

function iconUrl(heroName) {
    return ICON_DIR + encodeURIComponent(heroName) + '.webp';
}

function avatarFor(heroName, className) {
    const img = el('img', className);
    img.src = iconUrl(heroName);
    img.alt = ''; // 英雄名就在旁边，读屏不必重复朗读
    img.loading = 'lazy';
    img.addEventListener('error', () => { img.src = FALLBACK_ICON; }, { once: true });
    return img;
}

function fmt(value) {
    if (value === null || value === undefined) return null;
    const num = parseFloat(value);
    if (Number.isNaN(num)) return null;
    return Math.round(num * 100) + '%';
}

function getCssClass(value) {
    if (value === null || value === undefined) return 'empty';
    const num = parseFloat(value);
    if (Number.isNaN(num)) return 'empty';
    if (num > 1) return 'positive';
    if (num < 1) return 'negative';
    return 'neutral';
}

function getTakenCssClass(value) {
    if (value === null || value === undefined) return 'empty';
    const num = parseFloat(value);
    if (Number.isNaN(num)) return 'empty';
    if (num > 1) return 'negative';
    if (num < 1) return 'positive';
    return 'neutral';
}

function parseVersion(versionStr) {
    if (!versionStr) return [0, 0, ''];
    const match = String(versionStr).match(/^(\d+)\.(\d+)([a-zA-Z]?)/);
    if (match) {
        return [parseInt(match[1], 10), parseInt(match[2], 10), match[3] || ''];
    }
    return [0, 0, ''];
}

/** 新版本排前面 */
function compareVersionsDesc(a, b) {
    const va = parseVersion(a);
    const vb = parseVersion(b);
    if (va[0] !== vb[0]) return vb[0] - va[0];
    if (va[1] !== vb[1]) return vb[1] - va[1];
    return (vb[2] || '').localeCompare(va[2] || '');
}

// ================================================================
// 卡片渲染
// ================================================================
function attrItem(label, valueText, cssClass) {
    const item = el('span', 'attr-item');
    item.append(el('span', 'label', label));
    item.append(el('span', `value ${cssClass}`, valueText === null ? '—' : valueText));
    return item;
}

function createCard(hero) {
    // 用 <button> 而不是 <div>，键盘 Tab / 回车 / 空格天然可用
    const card = el('button', 'card');
    card.type = 'button';
    card.dataset.name = hero.name;
    card.setAttribute('aria-haspopup', 'dialog');

    const header = el('div', 'hero-header');
    header.append(
        avatarFor(hero.name),
        el('span', 'hero-name', hero.name),
        el('span', `type-badge type-${hero.type || '其他'}`, hero.type || '其他')
    );

    const attrs = el('div', 'attrs');
    attrs.append(attrItem('伤害', fmt(hero.damage), getCssClass(hero.damage)));
    attrs.append(attrItem('承伤', fmt(hero.taken), getTakenCssClass(hero.taken)));

    const heal = fmt(hero.heal);
    if (heal !== null) attrs.append(attrItem('治疗', heal, getCssClass(hero.heal)));

    const shield = fmt(hero.shield);
    if (shield !== null) attrs.append(attrItem('护盾', shield, getCssClass(hero.shield)));

    if (hero.other) {
        const other = el('div', 'other-buff');
        other.append(el('span', 'buff-label', '✦ 增益'), el('span', 'buff-desc', hero.other));
        attrs.append(other);
    }

    card.append(header, attrs);
    return card;
}

function render(heroList) {
    grid.textContent = '';

    if (heroList.length === 0) {
        noResult.hidden = false;
        resultCount.textContent = '共 0 位英雄';
        matchInfo.textContent = '';
        return;
    }

    noResult.hidden = true;
    resultCount.textContent = `共 ${heroList.length} 位英雄`;
    matchInfo.textContent = `匹配 ${heroList.length} 个结果`;

    const fragment = document.createDocumentFragment();
    for (const hero of heroList) fragment.append(createCard(hero));
    grid.append(fragment);
}

function filterAndRender() {
    const keyword = searchText.trim();
    render(heroes.filter(hero => {
        const nameMatch = keyword === '' || hero.name.includes(keyword);
        const typeMatch = currentType === 'all' || hero.type === currentType;
        return nameMatch && typeMatch;
    }));
}

/** 一帧内只渲染一次，中文输入法连打时不会反复重建整个网格 */
function scheduleRender() {
    if (renderFrame !== null) return;
    renderFrame = requestAnimationFrame(() => {
        renderFrame = null;
        filterAndRender();
    });
}

// ================================================================
// 提示状态
// ================================================================
function showLoading() {
    grid.textContent = '';
    const tip = el('div', 'loading-tip');
    tip.append(el('div', 'spinner'), el('div', null, '正在加载英雄数据…'));
    grid.append(tip);
    resultCount.textContent = '加载中…';
    matchInfo.textContent = '';
}

function showError(detail) {
    grid.textContent = '';
    noResult.hidden = true;
    const tip = el('div', 'loading-tip is-error');
    tip.append(el('span', 'tip-icon', '❌'));
    tip.append(el('p', null, '数据加载失败，请检查网络或刷新重试'));
    if (detail) tip.append(el('p', 'tip-detail', detail));
    grid.append(tip);
    resultCount.textContent = '加载失败';
    matchInfo.textContent = '';
}

function showEmpty() {
    grid.textContent = '';
    noResult.hidden = true;
    const tip = el('div', 'loading-tip');
    tip.append(el('span', 'tip-icon', '📭'));
    tip.append(el('p', null, '暂无英雄数据，请检查 heroes.json 文件'));
    grid.append(tip);
    resultCount.textContent = '共 0 位英雄';
    matchInfo.textContent = '';
}

// ================================================================
// 版本信息：从备注里汇总，不再手写
// ================================================================
function renderVersionInfo() {
    const versions = [...new Set(
        heroes.flatMap(hero => (hero.remarks || []).map(remark => remark.version))
    )].filter(Boolean).sort(compareVersionsDesc);

    if (versions.length === 0) {
        versionBadge.textContent = '';
        dataVersions.textContent = '暂无版本信息';
        return;
    }

    versionBadge.textContent = `v${versions[0]}`;
    dataVersions.textContent = `数据涵盖 ${versions.join(' / ')} 版本`;
}

// ================================================================
// 弹窗
// ================================================================
let lastFocused = null;

function openModal() {
    lastFocused = document.activeElement;
    modalOverlay.classList.add('active');
    if (pageContainer) pageContainer.inert = true; // 背景不再可聚焦
    modalBody.scrollTop = 0;
    modal.focus();
}

function closeModal() {
    if (!modalOverlay.classList.contains('active')) return;
    modalOverlay.classList.remove('active');
    if (pageContainer) pageContainer.inert = false;
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    lastFocused = null;
}

function focusableInModal() {
    return Array.from(modalOverlay.querySelectorAll(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter(node => node.offsetParent !== null);
}

function onDocumentKeydown(event) {
    if (!modalOverlay.classList.contains('active')) return;

    if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
        return;
    }
    if (event.key !== 'Tab') return;

    // 把 Tab 关在弹窗里
    const focusables = focusableInModal();
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function openHeroRemarksModal(heroName) {
    const hero = heroByName.get(heroName);
    if (!hero) return;

    modalTitle.textContent = `📝 ${hero.name} · 历史调整`;
    modalBody.textContent = '';

    const remarks = hero.remarks || [];
    if (remarks.length === 0) {
        modalBody.append(el('div', 'remark-empty', '该英雄暂无历史调整记录'));
    } else {
        for (const remark of remarks) {
            const item = el('div', 'remark-item');
            if (remark.version) item.append(el('span', 'remark-version', remark.version));
            item.append(el('span', 'remark-content', remark.content));
            modalBody.append(item);
        }
    }

    openModal();
}

function openAllRemarksModal() {
    modalTitle.textContent = '📋 全部更新记录';
    modalBody.textContent = '';

    const withRemarks = heroes
        .filter(hero => hero.remarks && hero.remarks.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name, 'zh'));

    if (withRemarks.length === 0) {
        modalBody.append(el('div', 'remark-empty', '暂无任何更新记录'));
        openModal();
        return;
    }

    for (const hero of withRemarks) {
        const group = el('div', 'hero-remark-group');

        const info = el('div', 'group-info');
        info.append(el('div', 'group-name', hero.name));

        const list = el('div', 'group-remarks');
        [...hero.remarks]
            .sort((a, b) => compareVersionsDesc(a.version, b.version))
            .forEach(remark => {
                const line = el('div', 'remark-line');
                if (remark.version) line.append(el('span', 'rv', remark.version));
                line.append(el('span', 'rc', remark.content));
                list.append(line);
            });
        info.append(list);

        group.append(avatarFor(hero.name, 'group-avatar'), info);
        modalBody.append(group);
    }

    openModal();
}

// ================================================================
// 数据加载
// ================================================================
async function loadHeroesFromJson() {
    try {
        const response = await fetch('heroes.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('加载 heroes.json 失败:', error);
        showError(error.message);
        return null;
    }
}

// ================================================================
// 筛选状态
// ================================================================
function setActiveType(type) {
    currentType = type;
    typeButtons.forEach(button => {
        const isActive = button.dataset.type === type;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    filterAndRender();
}

function resetFilters() {
    searchInput.value = '';
    searchText = '';
    clearBtn.classList.remove('visible');
    setActiveType('all');
    searchInput.focus();
}

// ================================================================
// 事件绑定
// ================================================================
// 卡片是动态生成的，用事件委托，不再往 HTML 里拼 onclick
grid.addEventListener('click', event => {
    const card = event.target.closest('.card');
    if (card && grid.contains(card)) openHeroRemarksModal(card.dataset.name);
});

searchInput.addEventListener('input', () => {
    clearBtn.classList.toggle('visible', searchInput.value.length > 0);
    searchText = searchInput.value;
    scheduleRender();
});

clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchText = '';
    clearBtn.classList.remove('visible');
    filterAndRender();
    searchInput.focus();
});

typeButtons.forEach(button => {
    button.addEventListener('click', () => setActiveType(button.dataset.type));
});

allRemarksBtn.addEventListener('click', openAllRemarksModal);
resetBtn.addEventListener('click', resetFilters);
modalCloseBtn.addEventListener('click', closeModal);

modalOverlay.addEventListener('click', event => {
    if (event.target === modalOverlay) closeModal();
});

document.addEventListener('keydown', onDocumentKeydown);

// ================================================================
// 启动
// ================================================================
async function init() {
    showLoading();

    const data = await loadHeroesFromJson();
    if (data === null) return; // 失败提示已经渲染好了

    heroes = Array.isArray(data) ? data : [];
    heroByName.clear();
    heroes.forEach(hero => {
        if (hero && hero.name) heroByName.set(hero.name, hero);
    });

    if (heroes.length === 0) {
        showEmpty();
        return;
    }

    renderVersionInfo();
    filterAndRender();
}

init();
