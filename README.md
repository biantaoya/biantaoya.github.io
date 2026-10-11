# 符文大乱斗 · 英雄属性查询

《英雄联盟手游》符文大乱斗模式的英雄 Buff 查询页：伤害、承伤、治疗、护盾调整，以及每个英雄的历史调整记录。

纯静态站点，没有构建步骤，由 GitHub Pages 直接托管：<https://biantaoya.github.io/>

## 数据怎么流动

```
data.xlsx  ──(GitHub Actions 跑 convert.py)──>  heroes.json  ──(fetch)──>  页面渲染
  人工维护                                        CI 自动提交
```

- 唯一数据源是 `data.xlsx`。
- 推到 `main` 且 `data.xlsx` 有变化时，Actions 会自动跑 `convert.py`、更新 `heroes.json` 和
  `sitemap.xml` 的 `lastmod`，然后提交回仓库。
- 也可以在 Actions 页面手动触发（`workflow_dispatch`）。
- `heroes.json` 是生成物，不要手改。页面上的版本徽章和页脚版本范围都是从它的备注里推导的，
  不需要手工维护。

## data.xlsx 的约定

| 位置 | 内容 |
| --- | --- |
| 第 1 行 | 合并标题，不参与解析 |
| 第 2 行 | 列名 |
| 第 3 行起 | 每个英雄一行 |

必需列：`英雄名称`、`造成伤害百分比`、`承受伤害百分比`、`治疗效果`、`护盾效果`、`其他增益`、`英雄类型`。

- 列名里含「备注」的列会被自动识别为历史调整列（当前是 备注1 / 备注2 / 备注3），可以有任意多个。
- 每条备注建议以版本号结尾，比如 `…，7.2c版本`。脚本据此提取版本用于排序和显示；
  也认 `版本7.2c`、`v7.2c` 这些写法。没写版本不会报错，但会在转换日志里单独列出来。
- `英雄类型` 只认 战士 / 坦克 / 法师 / 刺客 / 射手 / 辅助。出现新类型会警告，因为
  `style.css` 里没有对应的标签配色。
- `其他增益` 是自由文本，会原样显示在卡片上。

## 本地跑一次

```bash
pip install -r requirements.txt
python convert.py
```

想预览页面需要起个静态服务器（直接双击 `index.html` 不行，浏览器会拦掉 `fetch`）：

```bash
python -m http.server 8000
```

`convert.py` 在写 `heroes.json` 之前会先校验：必需列是否齐全、英雄数是否小于下限、有没有重名、
有没有缺失的职业或整行错位的记录。任何一项不过就以非 0 退出，并且不动已有的 `heroes.json`，
所以坏数据不会被静默提交上线。

## 文件说明

| 文件 | 说明 |
| --- | --- |
| `index.html` | 页面结构 |
| `script.js` | 数据加载与渲染（原生 JS，无框架、无构建） |
| `style.css` | 样式 |
| `convert.py` | `data.xlsx` → `heroes.json` |
| `data.xlsx` | 手工维护的数据源 |
| `heroes.json` | 由 `convert.py` 生成 |
| `champions/` | 英雄头像，96×96 WebP |
| `favicon.svg` 等 | 站点图标，位图由 `favicon.svg` 生成 |
| `og-cover.png` | 分享到聊天软件时的卡片图 |
| `tools/build-assets.mjs` | 重新生成上面的图片资源 |

## 图片素材

头像显示尺寸是 44px（手机 38px），所以仓库里存的是 96×96 WebP。
原始素材是 128×128 PNG，放在本地目录 `icons-source/`（已在 `.gitignore` 里，不入库）：

```powershell
# 素材已随仓库历史保留，需要时取回并改名成语义更清楚的目录名
git checkout <旧的提交> -- "英雄联盟英雄头像_真名命名_173个"
Rename-Item "英雄联盟英雄头像_真名命名_173个" "icons-source"
```

改完素材后重新生成（需要先 `npm install sharp`）：

```bash
node tools/build-assets.mjs
```

头像文件名必须和 `data.xlsx` 里的英雄名完全一致，否则页面会退回到默认图。
