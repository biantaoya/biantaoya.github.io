import pandas as pd
import json
import os
import re

# 获取脚本所在目录
script_dir = os.path.dirname(os.path.abspath(__file__))
excel_path = os.path.join(script_dir, 'data.xlsx')
json_path = os.path.join(script_dir, 'heroes.json')


def extract_version(text):
    """
    从备注文本中提取版本号，如 '7.2c'、'7.1d'、'6.3d'
    返回版本号字符串，如果找不到则返回 None
    """
    if not text or not isinstance(text, str):
        return None
    # 匹配类似 7.2c、7.1d、6.3d 的版本号
    # 支持 x.x 或 x.xx 格式，后跟一个字母
    pattern = r'(\d+\.\d+[a-zA-Z]?)'
    match = re.search(pattern, text)
    if match:
        return match.group(1)
    return None


def parse_version(version_str):
    """
    将版本号字符串解析为可排序的元组
    例如 '7.2c' -> (7, 2, 'c')
    用于后续排序
    """
    if not version_str:
        return (0, 0, '')
    match = re.match(r'(\d+)\.(\d+)([a-zA-Z]?)', version_str)
    if match:
        major = int(match.group(1))
        minor = int(match.group(2))
        letter = match.group(3) or ''
        return (major, minor, letter)
    return (0, 0, '')


def sort_remarks(remarks):
    """
    按版本号降序排列备注（最新版本在前）
    """
    return sorted(
        remarks,
        key=lambda x: parse_version(x.get('version', '')),
        reverse=True
    )


def convert_excel_to_json():
    # 读取 Excel
    df = pd.read_excel(excel_path, header=0)

    print("📋 检测到的列名：", df.columns.tolist())

    # ----- 1. 定义列名映射（中文 -> 英文字段） -----
    column_mapping = {
        '英雄名称': 'name',
        '造成伤害百分比': 'damage',
        '承受伤害百分比': 'taken',
        '治疗效果': 'heal',
        '护盾效果': 'shield',
        '英雄类型': 'type',
        # 其他列（英雄头像、其他增益等）会被忽略
    }

    # 找出所有备注列（列名包含"备注"的）
    remark_columns = [col for col in df.columns if '备注' in str(col)]

    # 构建完整的映射，备注列保持原名（后续单独处理）
    full_mapping = column_mapping.copy()
    # 备注列不重命名，保留原名

    # ----- 2. 重命名基础列 -----
    # 只重命名在 mapping 中存在的列
    rename_dict = {col: full_mapping[col] for col in df.columns if col in full_mapping}
    df = df.rename(columns=rename_dict)

    # 提取备注数据（在重命名之前已经记录了备注列名，但重命名后列名变了）
    # 重新找出备注列（重命名后列名还是中文，因为我们没重命名备注列）
    # 实际上上面的 rename 只处理了 mapping 中的列，备注列没有被 rename
    # 所以备注列名还是原来的中文名

    # 重新找出所有备注列（未被重命名的）
    remark_columns_final = [col for col in df.columns if '备注' in str(col)]

    # ----- 3. 处理每一行数据 -----
    heroes = []

    for idx, row in df.iterrows():
        hero_data = {
            'name': row.get('英雄名称') if '英雄名称' in df.columns else row.get('name'),
            'damage': row.get('造成伤害百分比') if '造成伤害百分比' in df.columns else row.get('damage'),
            'taken': row.get('承受伤害百分比') if '承受伤害百分比' in df.columns else row.get('taken'),
            'heal': row.get('治疗效果') if '治疗效果' in df.columns else row.get('heal'),
            'shield': row.get('护盾效果') if '护盾效果' in df.columns else row.get('shield'),
            'type': row.get('英雄类型') if '英雄类型' in df.columns else row.get('type'),
            'remarks': []  # 存放备注列表
        }

        # 处理所有备注列（列名中包含"备注"的）
        # 按列名排序，确保备注1、备注2...的顺序
        sorted_remark_cols = sorted(
            [col for col in df.columns if '备注' in str(col)],
            key=lambda x: int(re.search(r'\d+', str(x)).group(0)) if re.search(r'\d+', str(x)) else 0
        )

        for col in sorted_remark_cols:
            content = row.get(col)
            if pd.notna(content) and str(content).strip():
                content_str = str(content).strip()
                version = extract_version(content_str)
                remark_entry = {
                    'content': content_str,
                    'version': version,
                    # 保存原始列名，方便追踪
                    'column': col
                }
                hero_data['remarks'].append(remark_entry)

        # 按版本号排序备注（最新在前）
        hero_data['remarks'] = sort_remarks(hero_data['remarks'])

        # 处理数值类型（确保是 float 或 None）
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

        heroes.append(hero_data)

    # ----- 4. 写入 heroes.json -----
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(heroes, f, ensure_ascii=False, indent=2)

    print(f'✅ 成功转换 {len(heroes)} 个英雄数据到 heroes.json')

    # 统计备注信息
    total_remarks = sum(len(h.get('remarks', [])) for h in heroes)
    print(f'📝 共包含 {total_remarks} 条历史调整备注')


if __name__ == '__main__':
    convert_excel_to_json()