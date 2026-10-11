import json
import os
import re
import sys
from collections import Counter

import pandas as pd

script_dir = os.path.dirname(os.path.abspath(__file__))
excel_path = os.path.join(script_dir, 'data.xlsx')
json_path = os.path.join(script_dir, 'heroes.json')

# Windows 控制台默认是 GBK，print emoji 会 UnicodeEncodeError；输出被重定向时同样会崩。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8', errors='replace')
    except (AttributeError, ValueError, OSError):
        pass

# data.xlsx 必须包含的列，缺任何一列都说明表格结构变了。
REQUIRED_COLUMNS = [
    '英雄名称',
    '造成伤害百分比',
    '承受伤害百分比',
    '治疗效果',
    '护盾效果',
    '其他增益',
    '英雄类型',
]

# style.css 里为这些类型定义了配色，出现新类型会渲染成没有样式的标签。
KNOWN_TYPES = {'战士', '坦克', '法师', '刺客', '射手', '辅助'}

# 解析出的英雄数低于这个值，几乎一定是表格结构出问题了。
MIN_HERO_COUNT = 100
NUMBER_FIELDS = ['damage', 'taken', 'heal', 'shield']


def fail(message):
    """校验不通过：说明原因并以非 0 退出，让 CI 失败而不是提交坏数据。"""
    print(f'\n❌ 数据校验失败：{message}', file=sys.stderr)
    sys.exit(1)


# 版本号优先认带关键词的写法（7.2c版本 / 版本7.2c / v7.2c），
# 避免在整段文字里抓到第一个小数就当版本。
VERSION_PATTERNS = [
    re.compile(r'(\d+\.\d+[a-zA-Z]?)\s*版本'),
    re.compile(r'版本\s*[:：]?\s*(\d+\.\d+[a-zA-Z]?)'),
    re.compile(r'[vV](\d+\.\d+[a-zA-Z]?)\b'),
]

# 兜底：必须带字母后缀，这样「14.5秒」这类小数不会被误判成版本号
VERSION_FALLBACK = re.compile(r'(?<![\d.])(\d+\.\d+[a-zA-Z])(?![\d.])')


def extract_version(text):
    if not text or not isinstance(text, str):
        return None
    for pattern in VERSION_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(1)
    match = VERSION_FALLBACK.search(text)
    return match.group(1) if match else None


def parse_version(version_str):
    if not version_str:
        return (0, 0, '')
    match = re.match(r'(\d+)\.(\d+)([a-zA-Z]?)', version_str)
    if match:
        return (int(match.group(1)), int(match.group(2)), match.group(3) or '')
    return (0, 0, '')


def sort_remarks(remarks):
    return sorted(remarks, key=lambda x: parse_version(x.get('version', '')), reverse=True)


def validate_columns(df):
    missing = [col for col in REQUIRED_COLUMNS if col not in df.columns]
    if missing:
        fail(
            f'data.xlsx 缺少必需列 {missing}。\n'
            f'   实际读到的列名：{df.columns.tolist()}\n'
            f'   请检查第一行合并标题、第二行列名是否被改动。'
        )


def validate_heroes(heroes):
    if len(heroes) < MIN_HERO_COUNT:
        fail(
            f'只解析出 {len(heroes)} 个英雄，少于预期下限 {MIN_HERO_COUNT} 个。\n'
            f'   为避免用残缺数据覆盖线上 heroes.json，已中止。'
        )

    names = [h['name'] for h in heroes]
    duplicates = sorted(name for name, count in Counter(names).items() if count > 1)
    if duplicates:
        fail(f'英雄名称重复：{duplicates}')

    missing_type = [h['name'] for h in heroes
                    if not isinstance(h.get('type'), str) or not h['type'].strip()]
    if missing_type:
        fail(f'以下英雄缺少「英雄类型」：{missing_type}')

    no_data = [h['name'] for h in heroes
               if not h.get('other') and all(h.get(field) is None for field in NUMBER_FIELDS)]
    if no_data:
        fail(f'以下英雄既无数值也无增益，疑似整行错位：{no_data}')

    unknown_types = sorted({h['type'] for h in heroes if h['type'] not in KNOWN_TYPES})
    if unknown_types:
        print(f'⚠️  出现 style.css 未定义配色的英雄类型：{unknown_types}')


def report_unversioned_remarks(heroes):
    """备注里没写版本号时提醒一下，让问题在数据源上修掉，
    而不是页面上静默地少一个版本标签。"""
    missing = [(hero['name'], remark['column'], remark['content'])
               for hero in heroes
               for remark in hero['remarks']
               if not remark['version']]
    if not missing:
        return
    print(f'⚠️  {len(missing)} 条备注没有标注版本，无法参与版本排序：')
    for name, column, content in missing:
        print(f'    - {name} / {column} / {content}')
    print('    建议在备注末尾补上「X.Yz版本」，脚本才能提取出版本号。')


def convert_excel_to_json():
    # 第二行是列名（第一行是合并标题）
    df = pd.read_excel(excel_path, header=1, engine='openpyxl')

    print("📋 实际读取到的列名：", df.columns.tolist())

    # 列不准就直接退出，否则后面会静默丢字段
    validate_columns(df)

    # 列名映射（确保“其他增益”完全匹配）
    column_mapping = {
        '英雄名称': 'name',
        '造成伤害百分比': 'damage',
        '承受伤害百分比': 'taken',
        '治疗效果': 'heal',
        '护盾效果': 'shield',
        '其他增益': 'other',      # 关键字段
        '英雄类型': 'type',
    }

    # 找出所有备注列
    remark_columns = [col for col in df.columns if '备注' in str(col)]
    print(f"📝 检测到的备注列：{remark_columns}")

    # 重命名列
    rename_dict = {col: column_mapping[col] for col in df.columns if col in column_mapping}
    df = df.rename(columns=rename_dict)

    heroes = []

    for idx, row in df.iterrows():
        hero_data = {
            'name': row.get('name'),
            'damage': row.get('damage'),
            'taken': row.get('taken'),
            'heal': row.get('heal'),
            'shield': row.get('shield'),
            'other': row.get('other'),    # 读取“其他增益”
            'type': row.get('type'),
            'remarks': []
        }

        if pd.isna(hero_data['name']) or str(hero_data['name']).strip() == '':
            continue

        # 处理备注
        for col in remark_columns:
            content = row.get(col)
            if pd.notna(content) and str(content).strip():
                content_str = str(content).strip()
                version = extract_version(content_str)
                hero_data['remarks'].append({
                    'content': content_str,
                    'version': version,
                    'column': col
                })

        hero_data['remarks'] = sort_remarks(hero_data['remarks'])

        # 处理数值字段
        for key in ['damage', 'taken', 'heal', 'shield']:
            val = hero_data.get(key)
            if pd.isna(val):
                hero_data[key] = None
            elif isinstance(val, (int, float)):
                hero_data[key] = float(val)
            else:
                try:
                    hero_data[key] = float(val)
                except (ValueError, TypeError):
                    hero_data[key] = None

        # 处理“其他增益”（保留文本）
        other_val = hero_data.get('other')
        if pd.isna(other_val):
            hero_data['other'] = None
        else:
            hero_data['other'] = str(other_val).strip()

        heroes.append(hero_data)

    # 先校验再落盘：校验不通过时线上 heroes.json 保持原样
    validate_heroes(heroes)

    try:
        # allow_nan=False：NaN 不是合法 JSON，会让前端 JSON.parse 直接抛错
        payload = json.dumps(heroes, ensure_ascii=False, indent=2, allow_nan=False)
    except ValueError as exc:
        fail(f'生成的 JSON 不合法，多半是某个单元格类型不对：{exc}')

    # 先写临时文件再替换，避免中途失败留下半截 heroes.json
    tmp_path = json_path + '.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as f:
        f.write(payload)
    os.replace(tmp_path, json_path)

    print(f'✅ 成功转换 {len(heroes)} 个英雄数据到 heroes.json')
    # 打印包含“其他增益”的英雄数
    with_other = [h for h in heroes if h.get('other')]
    print(f'📌 包含“其他增益”的英雄数：{len(with_other)}')
    if with_other:
        print('示例：', with_other[0]['name'], '->', with_other[0]['other'])

    report_unversioned_remarks(heroes)


if __name__ == '__main__':
    convert_excel_to_json()
