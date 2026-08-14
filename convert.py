import pandas as pd
import json
import os
import re

script_dir = os.path.dirname(os.path.abspath(__file__))
excel_path = os.path.join(script_dir, 'data.xlsx')
json_path = os.path.join(script_dir, 'heroes.json')


def extract_version(text):
    if not text or not isinstance(text, str):
        return None
    pattern = r'(\d+\.\d+[a-zA-Z]?)'
    match = re.search(pattern, text)
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


def convert_excel_to_json():
    # 第二行是列名（第一行是合并标题）
    df = pd.read_excel(excel_path, header=1, engine='openpyxl')

    print("📋 实际读取到的列名：", df.columns.tolist())

    # 列名映射（新增“其他增益”字段）
    column_mapping = {
        '英雄名称': 'name',
        '造成伤害百分比': 'damage',
        '承受伤害百分比': 'taken',
        '治疗效果': 'heal',
        '护盾效果': 'shield',
        '其他增益': 'other',      # ✅ 新增
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
            'other': row.get('other'),    # ✅ 新增
            'type': row.get('type'),
            'remarks': []
        }

        # 跳过空行
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

        # 处理“其他增益”字段（保留原始文本或数字）
        other_val = hero_data.get('other')
        if pd.isna(other_val):
            hero_data['other'] = None
        elif isinstance(other_val, (int, float)):
            hero_data['other'] = str(other_val)  # 数字转为字符串
        else:
            hero_data['other'] = str(other_val).strip() if other_val else None

        heroes.append(hero_data)

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(heroes, f, ensure_ascii=False, indent=2)

    print(f'✅ 成功转换 {len(heroes)} 个英雄数据到 heroes.json')
    print(f'📌 包含“其他增益”的英雄数：{len([h for h in heroes if h.get("other")])}')


if __name__ == '__main__':
    convert_excel_to_json()