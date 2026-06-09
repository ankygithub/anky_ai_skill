#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SVG验证脚本
检查SVG文件是否存在重叠、溢出、文字遮挡等问题

用法:
    python validate_svg.py <svg_file>
"""

import sys
import xml.etree.ElementTree as ET
import re


def parse_svg_file(filepath):
    """解析SVG文件，提取所有图形元素的位置和尺寸信息"""
    tree = ET.parse(filepath)
    root = tree.getroot()
    
    # 获取viewBox
    viewbox = root.get('viewBox', '0 0 100 100')
    vb_parts = viewbox.split()
    canvas_width = float(vb_parts[2]) if len(vb_parts) >= 3 else 100
    canvas_height = float(vb_parts[3]) if len(vb_parts) >= 4 else 100
    
    elements = []
    texts = []
    
    # 遍历所有元素
    for elem in root.iter():
        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
        
        if tag == 'rect':
            x = float(elem.get('x', 0))
            y = float(elem.get('y', 0))
            width = float(elem.get('width', 0))
            height = float(elem.get('height', 0))
            transform = elem.get('transform', '')
            x, y = apply_transform(x, y, transform)
            elements.append({
                'type': 'rect',
                'x': x, 'y': y,
                'width': width, 'height': height,
                'right': x + width,
                'bottom': y + height
            })
            
        elif tag == 'text':
            x = float(elem.get('x', 0))
            y = float(elem.get('y', 0))
            font_size = elem.get('font-size', '12')
            font_size = float(re.sub(r'px$', '', font_size))
            text_content = ''.join(elem.itertext())
            # 估算文字宽度和高度
            text_width = len(text_content) * font_size * 0.6
            text_height = font_size * 1.4
            transform = elem.get('transform', '')
            x, y = apply_transform(x, y, transform)
            texts.append({
                'type': 'text',
                'x': x, 'y': y,
                'width': text_width,
                'height': text_height,
                'right': x + text_width,
                'bottom': y + text_height,
                'content': text_content
            })
    
    return {
        'canvas_width': canvas_width,
        'canvas_height': canvas_height,
        'elements': elements,
        'texts': texts
    }


def apply_transform(x, y, transform):
    """应用简单的transform（仅支持translate）"""
    if not transform:
        return x, y
    
    translate_match = re.search(r'translate\(([^,]+),\s*([^)]+)\)', transform)
    if translate_match:
        tx = float(translate_match.group(1))
        ty = float(translate_match.group(2))
        return x + tx, y + ty
    
    return x, y


def check_overlaps(elements):
    """检查图形元素之间是否存在异常重叠（排除父子容器关系）"""
    overlaps = []
    for i in range(len(elements)):
        for j in range(i + 1, len(elements)):
            elem1 = elements[i]
            elem2 = elements[j]
            
            # 检查是否重叠（考虑一定容差）
            tolerance = 2
            if (elem1['x'] < elem2['right'] - tolerance and
                elem1['right'] > elem2['x'] + tolerance and
                elem1['y'] < elem2['bottom'] - tolerance and
                elem1['bottom'] > elem2['y'] + tolerance):
                
                # 判断是否为父子容器关系（一个元素几乎完全包含另一个）
                # 如果是父子容器，不算重叠问题
                elem1_area = elem1['width'] * elem1['height']
                elem2_area = elem2['width'] * elem2['height']
                
                # 计算重叠区域
                overlap_width = min(elem1['right'], elem2['right']) - max(elem1['x'], elem2['x'])
                overlap_height = min(elem1['bottom'], elem2['bottom']) - max(elem1['y'], elem2['y'])
                overlap_area = overlap_width * overlap_height
                
                # 如果重叠面积等于较小元素的面积，说明是包含关系
                smaller_area = min(elem1_area, elem2_area)
                if overlap_area >= smaller_area * 0.95:
                    continue  # 父子容器关系，跳过
                
                # 如果两个元素面积相近且重叠面积大，可能是同级重叠
                area_ratio = max(elem1_area, elem2_area) / min(elem1_area, elem2_area)
                if area_ratio < 2.0 and overlap_area > 0:
                    overlaps.append({
                        'elem1': elem1,
                        'elem2': elem2
                    })
    
    return overlaps


def check_overflow(elements, texts, canvas_width, canvas_height):
    """检查元素是否溢出画布"""
    overflows = []
    
    for elem in elements + texts:
        if elem['right'] > canvas_width:
            overflows.append({
                'element': elem,
                'issue': f"右侧溢出: {elem['right']:.1f} > {canvas_width}"
            })
        if elem['bottom'] > canvas_height:
            overflows.append({
                'element': elem,
                'issue': f"底部溢出: {elem['bottom']:.1f} > {canvas_height}"
            })
        if elem['x'] < 0:
            overflows.append({
                'element': elem,
                'issue': f"左侧溢出: {elem['x']:.1f} < 0"
            })
        if elem['y'] < 0:
            overflows.append({
                'element': elem,
                'issue': f"顶部溢出: {elem['y']:.1f} < 0"
            })
    
    return overflows


def check_text_obstruction(texts, elements):
    """检查文字是否溢出图形边界（排除背景层和正确居中的文字）"""
    obstructions = []
    
    for text in texts:
        for elem in elements:
            # 检查文字是否与图形重叠
            if (text['x'] < elem['right'] and
                text['right'] > elem['x'] and
                text['y'] < elem['bottom'] and
                text['bottom'] > elem['y']):
                
                # 跳过背景层（opacity < 0.5 的大矩形通常是背景）
                if elem.get('width', 0) > 200 and elem.get('height', 0) > 50:
                    continue
                
                # 文字在图形内部是正常的（如模块内文字）
                # 检查文字是否明显超出图形边界
                margin = 2
                text_width = text['right'] - text['x']
                text_height = text['bottom'] - text['y']
                elem_width = elem['right'] - elem['x']
                elem_height = elem['bottom'] - elem['y']
                
                # 如果文字比容器大很多，才可能溢出
                if (text_width > elem_width + margin * 2 or
                    text_height > elem_height + margin * 2):
                    obstructions.append({
                        'text': text,
                        'element': elem,
                        'issue': "文字明显超出图形边界"
                    })
    
    return obstructions


def validate_svg(filepath):
    """验证SVG文件"""
    print(f"正在验证: {filepath}")
    print("=" * 50)
    
    try:
        svg_data = parse_svg_file(filepath)
    except Exception as e:
        print(f"❌ 解析失败: {e}")
        return False
    
    print(f"画布尺寸: {svg_data['canvas_width']} x {svg_data['canvas_height']}")
    print(f"图形元素数量: {len(svg_data['elements'])}")
    print(f"文字元素数量: {len(svg_data['texts'])}")
    print()
    
    # 检查重叠
    overlaps = check_overlaps(svg_data['elements'])
    if overlaps:
        print(f"⚠️  发现 {len(overlaps)} 处图形重叠:")
        for i, overlap in enumerate(overlaps[:5], 1):
            print(f"  {i}. {overlap['elem1']['type']} 与 {overlap['elem2']['type']} 重叠")
        if len(overlaps) > 5:
            print(f"  ... 还有 {len(overlaps) - 5} 处")
    else:
        print("✅ 未发现图形重叠")
    print()
    
    # 检查溢出
    overflows = check_overflow(svg_data['elements'], svg_data['texts'], 
                               svg_data['canvas_width'], svg_data['canvas_height'])
    if overflows:
        print(f"⚠️  发现 {len(overflows)} 处溢出:")
        for i, overflow in enumerate(overflows[:5], 1):
            print(f"  {i}. {overflow['issue']}")
        if len(overflows) > 5:
            print(f"  ... 还有 {len(overflows) - 5} 处")
    else:
        print("✅ 未发现溢出")
    print()
    
    # 检查文字遮挡
    obstructions = check_text_obstruction(svg_data['texts'], svg_data['elements'])
    if obstructions:
        print(f"⚠️  发现 {len(obstructions)} 处文字可能溢出:")
        for i, obs in enumerate(obstructions[:5], 1):
            content = obs['text']['content'][:20]
            print(f"  {i}. 文字 '{content}...' {obs['issue']}")
        if len(obstructions) > 5:
            print(f"  ... 还有 {len(obstructions) - 5} 处")
    else:
        print("✅ 未发现文字溢出问题")
    print()
    
    # 总结
    total_issues = len(overlaps) + len(overflows) + len(obstructions)
    if total_issues == 0:
        print("🎉 验证通过！SVG质量良好。")
        return True
    else:
        print(f"📊 总计发现 {total_issues} 个问题，建议修复。")
        return False


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("用法: python validate_svg.py <svg_file>")
        sys.exit(1)
    
    filepath = sys.argv[1]
    success = validate_svg(filepath)
    sys.exit(0 if success else 1)
