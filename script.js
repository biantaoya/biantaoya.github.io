 // ================================================================
    // 全局状态
    // ================================================================
    let heroes = [];
    let currentType = 'all';
    let searchText = '';

    // ================================================================
    // DOM 引用
    // ================================================================
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearBtn');
    const resultCount = document.getElementById('resultCount');
    const matchInfo = document.getElementById('matchInfo');
    const grid = document.getElementById('heroGrid');
    const noResult = document.getElementById('noResult');
    const typeButtons = document.querySelectorAll('#typeFilter button');

    // ================================================================
    // 辅助函数
    // ================================================================
    function fmt(value) {
        if (value === null || value === undefined) return null;
        const num = parseFloat(value);
        if (isNaN(num)) return null;
        return Math.round(num * 100) + '%';
    }

    function getCssClass(value) {
        if (value === null || value === undefined) return 'empty';
        const num = parseFloat(value);
        if (isNaN(num)) return 'empty';
        if (num > 1) return 'positive';
        if (num < 1) return 'negative';
        return 'neutral';
    }

    function getTakenCssClass(value) {
        if (value === null || value === undefined) return 'empty';
        const num = parseFloat(value);
        if (isNaN(num)) return 'empty';
        if (num > 1) return 'negative';
        if (num < 1) return 'positive';
        return 'neutral';
    }

    function parseVersion(versionStr) {
        if (!versionStr) return [0, 0, ''];
        const match = versionStr.match(/^(\d+)\.(\d+)([a-zA-Z]?)/);
        if (match) {
            return [parseInt(match[1]), parseInt(match[2]), match[3] || ''];
        }
        return [0, 0, ''];
    }

    // ================================================================
    // 渲染函数
    // ================================================================
    function render(heroList) {
        if (heroList.length === 0) {
            grid.innerHTML = '';
            noResult.style.display = 'block';
            resultCount.textContent = '共 0 位英雄';
            matchInfo.textContent = '';
            return;
        }
        noResult.style.display = 'none';
        resultCount.textContent = `共 ${heroList.length} 位英雄`;

        let html = '';
        heroList.forEach(h => {
            const dmg = fmt(h.damage);
            const tkn = fmt(h.taken);
            const heal = fmt(h.heal);
            const shield = fmt(h.shield);
            const other = h.other || null;
            const dmgCls = getCssClass(h.damage);
            const tknCls = getTakenCssClass(h.taken);
            const healCls = getCssClass(h.heal);
            const shieldCls = getCssClass(h.shield);
            const iconPath = `./英雄联盟英雄头像_真名命名_173个/${h.name}.png`;
            const fallbackIcon = 'https://ddragon.leagueoflegends.com/cdn/14.10.1/img/champion/default.png';
            const typeClass = 'type-' + h.type;

            html += `
                <div class="card" onclick="openHeroRemarksModal('${h.name}')">
                    <div class="hero-header">
                        <img src="${iconPath}" alt="${h.name}" loading="lazy" onerror="this.src='${fallbackIcon}'">
                        <span class="hero-name">${h.name}</span>
                        <span class="type-badge ${typeClass}">${h.type || '其他'}</span>
                    </div>
                    <div class="attrs">
                        <span class="attr-item">
                            <span class="label">伤害</span>
                            <span class="value ${dmgCls}">${dmg || '—'}</span>
                        </span>
                        <span class="attr-item">
                            <span class="label">承伤</span>
                            <span class="value ${tknCls}">${tkn || '—'}</span>
                        </span>
                        ${heal !== null ? `<span class="attr-item"><span class="label">治疗</span><span class="value ${healCls}">${heal}</span></span>` : ''}
                        ${shield !== null ? `<span class="attr-item"><span class="label">护盾</span><span class="value ${shieldCls}">${shield}</span></span>` : ''}
                        ${other ? `<span class="attr-item"><span class="label">增益</span><span class="value other-buff">${other}</span></span>` : ''}
                    </div>
                </div>
            `;
        });
        grid.innerHTML = html;
        matchInfo.textContent = `匹配 ${heroList.length} 个结果`;
    }

    function filterAndRender() {
        const filtered = heroes.filter(h => {
            const nameMatch = h.name.includes(searchText);
            const typeMatch = currentType === 'all' || h.type === currentType;
            return nameMatch && typeMatch;
        });
        render(filtered);
    }

    // ================================================================
    // 从 heroes.json 加载数据
    // ================================================================
    async function loadHeroesFromJson() {
        try {
            const response = await fetch('heroes.json');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('加载 heroes.json 失败:', error);
            grid.innerHTML = `
                <div class="loading-tip" style="color: #dc2626;">
                    <span style="font-size: 2rem;">❌</span>
                    <p>数据加载失败，请检查网络或刷新重试</p>
                    <p style="font-size: 0.8rem; color: #9ca3af; margin-top: 0.5rem;">${error.message}</p>
                </div>
            `;
            resultCount.textContent = '加载失败';
            return [];
        }
    }

    // ================================================================
    // 弹窗相关
    // ================================================================
    function openHeroRemarksModal(heroName) {
        const hero = heroes.find(h => h.name === heroName);
        if (!hero) return;

        const title = document.getElementById('modalTitle');
        const body = document.getElementById('modalBody');

        title.textContent = `📝 ${hero.name} · 历史调整`;

        const remarks = hero.remarks || [];
        if (remarks.length === 0) {
            body.innerHTML = `<div class="remark-empty">该英雄暂无历史调整记录</div>`;
        } else {
            let html = '';
            remarks.forEach(r => {
                const versionDisplay = r.version ? `<span class="remark-version">${r.version}</span>` : '';
                html += `
                    <div class="remark-item">
                        ${versionDisplay}
                        <span class="remark-content">${r.content}</span>
                    </div>
                `;
            });
            body.innerHTML = html;
        }

        document.getElementById('remarkModal').classList.add('active');
    }

    function openAllRemarksModal() {
        const title = document.getElementById('modalTitle');
        const body = document.getElementById('modalBody');

        title.textContent = '📋 全部更新记录';

        const heroesWithRemarks = heroes
            .filter(h => h.remarks && h.remarks.length > 0)
            .sort((a, b) => a.name.localeCompare(b.name, 'zh'));

        if (heroesWithRemarks.length === 0) {
            body.innerHTML = `<div class="remark-empty">暂无任何更新记录</div>`;
            document.getElementById('remarkModal').classList.add('active');
            return;
        }

        const fallbackIcon = 'https://ddragon.leagueoflegends.com/cdn/14.10.1/img/champion/default.png';

        let html = '';
        heroesWithRemarks.forEach(h => {
            const iconPath = `./英雄联盟英雄头像_真名命名_173个/${h.name}.png`;
            const sortedRemarks = [...(h.remarks || [])].sort((a, b) => {
                const va = parseVersion(a.version);
                const vb = parseVersion(b.version);
                if (va[0] !== vb[0]) return vb[0] - va[0];
                if (va[1] !== vb[1]) return vb[1] - va[1];
                return (vb[2] || '').localeCompare(va[2] || '');
            });

            html += `
                <div class="hero-remark-group">
                    <img class="group-avatar" src="${iconPath}" alt="${h.name}" onerror="this.src='${fallbackIcon}'">
                    <div class="group-info">
                        <div class="group-name">${h.name}</div>
                        <div class="group-remarks">
            `;

            sortedRemarks.forEach(r => {
                const versionDisplay = r.version ? `<span class="rv">${r.version}</span>` : '';
                html += `
                    <div class="remark-line">
                        ${versionDisplay}
                        <span class="rc">${r.content}</span>
                    </div>
                `;
            });

            html += `
                        </div>
                    </div>
                </div>
            `;
        });

        body.innerHTML = html;
        document.getElementById('remarkModal').classList.add('active');
    }

    function closeModal() {
        document.getElementById('remarkModal').classList.remove('active');
    }

    document.getElementById('remarkModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });

    // ================================================================
    // 初始化
    // ================================================================
    async function init() {
        grid.innerHTML = `
            <div class="loading-tip">
                <div class="spinner"></div>
                <div>正在加载英雄数据…</div>
            </div>
        `;
        resultCount.textContent = '加载中…';

        heroes = await loadHeroesFromJson();

        if (heroes && heroes.length > 0) {
            filterAndRender();
        } else if (heroes && heroes.length === 0) {
            grid.innerHTML = `
                <div class="loading-tip">
                    <span style="font-size: 2rem;">📭</span>
                    <p>暂无英雄数据，请检查 heroes.json 文件</p>
                </div>
            `;
            resultCount.textContent = '共 0 位英雄';
        }
    }

    // ================================================================
    // 事件绑定
    // ================================================================
    searchInput.addEventListener('input', function() {
        const val = this.value;
        searchText = val;
        if (val.length > 0) {
            clearBtn.classList.add('visible');
        } else {
            clearBtn.classList.remove('visible');
        }
        filterAndRender();
    });

    clearBtn.addEventListener('click', function() {
        searchInput.value = '';
        searchText = '';
        clearBtn.classList.remove('visible');
        filterAndRender();
        searchInput.focus();
    });

    typeButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            typeButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentType = this.dataset.type;
            filterAndRender();
        });
    });

    function resetAll() {
        searchInput.value = '';
        searchText = '';
        clearBtn.classList.remove('visible');
        typeButtons.forEach(b => b.classList.remove('active'));
        const allBtn = document.querySelector('#typeFilter button[data-type="all"]');
        if (allBtn) allBtn.classList.add('active');
        currentType = 'all';
        filterAndRender();
        searchInput.focus();
    }

    window.resetAll = resetAll;
    window.openHeroRemarksModal = openHeroRemarksModal;
    window.openAllRemarksModal = openAllRemarksModal;
    window.closeModal = closeModal;

    // ================================================================
    // 启动
    // ================================================================
    init();