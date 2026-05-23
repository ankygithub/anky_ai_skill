#!/usr/bin/env node

/**
 * Markdown → HTML 片段转换器
 * 支持自定义组件语法 (:::) 转换为HTML
 */

const fs = require('fs');
const path = require('path');

// 简单的Markdown解析器
function parseMarkdown(mdContent) {
    let html = mdContent;
    
    // 解析YAML frontmatter
    const frontmatterMatch = html.match(/^---\n([\s\S]*?)\n---\n/);
    let frontmatter = {};
    if (frontmatterMatch) {
        const fmText = frontmatterMatch[1];
        fmText.split('\n').forEach(line => {
            const [key, ...valueParts] = line.split(':');
            if (key && valueParts.length > 0) {
                frontmatter[key.trim()] = valueParts.join(':').trim();
            }
        });
        html = html.slice(frontmatterMatch[0].length);
    }
    
    // 解析 :::info 组件
    html = html.replace(/:::info\s*(.*?)\n([\s\S]*?):::/g, (match, title, content) => {
        return `<div class="admonition info">
    <div class="admonition-title">ℹ ${title || '提示'}</div>
    ${parseInlineMarkdown(content.trim())}
</div>`;
    });
    
    // 解析 :::success 组件
    html = html.replace(/:::success\s*(.*?)\n([\s\S]*?):::/g, (match, title, content) => {
        return `<div class="admonition success">
    <div class="admonition-title">✓ ${title || '成功'}</div>
    ${parseInlineMarkdown(content.trim())}
</div>`;
    });
    
    // 解析 :::warning 组件
    html = html.replace(/:::warning\s*(.*?)\n([\s\S]*?):::/g, (match, title, content) => {
        return `<div class="admonition warning">
    <div class="admonition-title">⚠ ${title || '警告'}</div>
    ${parseInlineMarkdown(content.trim())}
</div>`;
    });
    
    // 解析 :::danger 组件
    html = html.replace(/:::danger\s*(.*?)\n([\s\S]*?):::/g, (match, title, content) => {
        return `<div class="admonition danger">
    <div class="admonition-title">✗ ${title || '危险'}</div>
    ${parseInlineMarkdown(content.trim())}
</div>`;
    });
    
    // 解析 :::compare 组件
    html = html.replace(/:::compare\s*(.*?)\n([\s\S]*?):::/g, (match, title, content) => {
        const leftMatch = content.match(/:::left\s*(.*?)\n([\s\S]*?):::/);
        const rightMatch = content.match(/:::right\s*(.*?)\n([\s\S]*?):::/);
        
        const leftTitle = leftMatch ? leftMatch[1] : '支持观点';
        const leftContent = leftMatch ? parseInlineMarkdown(leftMatch[2].trim()) : '';
        const rightTitle = rightMatch ? rightMatch[1] : '反对观点';
        const rightContent = rightMatch ? parseInlineMarkdown(rightMatch[2].trim()) : '';
        
        return `<div class="compare-box">
    <div class="compare-item left">
        <div class="compare-title">${leftTitle}</div>
        ${leftContent}
    </div>
    <div class="compare-item right">
        <div class="compare-title">${rightTitle}</div>
        ${rightContent}
    </div>
</div>`;
    });
    
    // 解析 :::steps 组件
    html = html.replace(/:::steps\n([\s\S]*?):::/g, (match, content) => {
        const steps = content.trim().split('\n\n');
        let stepsHtml = '<div class="steps">\n';
        
        steps.forEach((step, index) => {
            const lines = step.split('\n');
            const title = lines[0].replace(/^\d+\.\s*/, '');
            const description = lines.slice(1).join('\n').trim();
            
            stepsHtml += `    <div class="step">
        <div class="step-number">${index + 1}</div>
        <div class="step-content">
            <div class="step-title">${title}</div>
            ${description ? `<p>${parseInlineMarkdown(description)}</p>` : ''}
        </div>
    </div>\n`;
        });
        
        stepsHtml += '</div>';
        return stepsHtml;
    });
    
    // 解析 :::details 组件
    html = html.replace(/:::details\s*(.*?)\n([\s\S]*?):::/g, (match, title, content) => {
        return `<details class="details">
    <summary class="details-summary">${title}</summary>
    <div class="details-content">
        ${parseInlineMarkdown(content.trim())}
    </div>
</details>`;
    });
    
    // 解析 :::evidence 组件
    html = html.replace(/:::evidence\s*(.*?)\n([\s\S]*?):::/g, (match, title, content) => {
        return `<div class="evidence-card">
    <div class="evidence-header">📋 ${title}</div>
    <div class="evidence-body">
        ${parseInlineMarkdown(content.trim())}
    </div>
</div>`;
    });
    
    // 解析标准Markdown
    html = parseStandardMarkdown(html);
    
    return { frontmatter, html };
}

function parseInlineMarkdown(text) {
    // 粗体
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // 斜体
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // 行内代码
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    // 换行转<br>
    text = text.replace(/\n/g, '<br>');
    return text;
}

function parseStandardMarkdown(md) {
    let html = md;
    
    // 标题
    html = html.replace(/^### (.*$)/gim, '<h4>$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^# (.*$)/gim, '<h2>$1</h2>');
    
    // 粗体和斜体
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // 行内代码
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // 代码块
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code>${code.trim()}</code></pre>`;
    });
    
    // 引用
    html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');
    
    // 无序列表 - 先收集所有列表项
    const ulRegex = /^- (.*$)/gim;
    const ulMatches = [];
    let match;
    while ((match = ulRegex.exec(html)) !== null) {
        ulMatches.push({ index: match.index, text: match[0], content: match[1] });
    }
    
    // 处理无序列表
    if (ulMatches.length > 0) {
        let result = '';
        let lastIndex = 0;
        let inList = false;
        
        ulMatches.forEach((m, i) => {
            // 检查是否是连续的列表项
            const prevEnd = i > 0 ? ulMatches[i-1].index + ulMatches[i-1].text.length : 0;
            const isContinuous = i === 0 || (m.index - prevEnd <= 2);
            
            if (!isContinuous && inList) {
                result += html.substring(lastIndex, prevEnd) + '</ul>\n';
                lastIndex = prevEnd;
                inList = false;
            }
            
            if (!inList) {
                result += html.substring(lastIndex, m.index) + '<ul>\n';
                lastIndex = m.index;
                inList = true;
            }
            
            // 替换当前行为 <li>
            const before = html.substring(lastIndex, m.index);
            const liContent = `<li>${m.content}</li>`;
            result += before + liContent;
            lastIndex = m.index + m.text.length;
        });
        
        if (inList) {
            result += html.substring(lastIndex) + '</ul>';
        } else {
            result += html.substring(lastIndex);
        }
        html = result;
    }
    
    // 有序列表 - 同样处理
    const olRegex = /^\d+\.\s+(.*$)/gim;
    const olMatches = [];
    while ((match = olRegex.exec(html)) !== null) {
        olMatches.push({ index: match.index, text: match[0], content: match[1] });
    }
    
    if (olMatches.length > 0) {
        let result = '';
        let lastIndex = 0;
        let inList = false;
        
        olMatches.forEach((m, i) => {
            const prevEnd = i > 0 ? olMatches[i-1].index + olMatches[i-1].text.length : 0;
            const isContinuous = i === 0 || (m.index - prevEnd <= 2);
            
            if (!isContinuous && inList) {
                result += html.substring(lastIndex, prevEnd) + '</ol>\n';
                lastIndex = prevEnd;
                inList = false;
            }
            
            if (!inList) {
                result += html.substring(lastIndex, m.index) + '<ol>\n';
                lastIndex = m.index;
                inList = true;
            }
            
            const before = html.substring(lastIndex, m.index);
            const liContent = `<li>${m.content}</li>`;
            result += before + liContent;
            lastIndex = m.index + m.text.length;
        });
        
        if (inList) {
            result += html.substring(lastIndex) + '</ol>';
        } else {
            result += html.substring(lastIndex);
        }
        html = result;
    }
    
    // 表格（简化处理）
    const tableRegex = /\|(.+)\|\n\|[-:\s|]+\|\n((?:\|.+")|\n?)+)/;
    html = html.replace(tableRegex, (match, header, rows) => {
        const headers = header.split('|').map(h => h.trim()).filter(h => h);
        const rowData = rows.trim().split('\n').map(row => {
            return row.split('|').map(c => c.trim()).filter(c => c);
        });
        
        let tableHtml = '<table>\n<thead>\n<tr>';
        headers.forEach(h => {
            tableHtml += `<th>${h}</th>`;
        });
        tableHtml += '</tr>\n</thead>\n<tbody>\n';
        
        rowData.forEach(row => {
            tableHtml += '<tr>';
            row.forEach(cell => {
                tableHtml += `<td>${cell}</td>`;
            });
            tableHtml += '</tr>\n';
        });
        
        tableHtml += '</tbody>\n</table>';
        return tableHtml;
    });
    
    // 段落处理 - 更智能的段落分割
    // 将文本分割为块，每个块根据类型决定包装
    const blocks = [];
    const lines = html.split('\n');
    let currentBlock = { type: 'text', content: [] };
    
    lines.forEach(line => {
        const trimmed = line.trim();
        
        // 检查是否是块级元素
        if (trimmed.startsWith('<h') || 
            trimmed.startsWith('<ul') || trimmed.startsWith('</ul') ||
            trimmed.startsWith('<ol') || trimmed.startsWith('</ol') ||
            trimmed.startsWith('<table') || trimmed.startsWith('</table') ||
            trimmed.startsWith('<div') || trimmed.startsWith('</div') ||
            trimmed.startsWith('<details') || trimmed.startsWith('</details') ||
            trimmed.startsWith('<blockquote') || trimmed.startsWith('</blockquote') ||
            trimmed.startsWith('<pre') || trimmed.startsWith('</pre') ||
            trimmed.startsWith('<li') || trimmed.startsWith('</li')) {
            
            // 保存当前文本块
            if (currentBlock.content.length > 0) {
                blocks.push({ ...currentBlock });
                currentBlock = { type: 'text', content: [] };
            }
            
            // 添加块级元素
            blocks.push({ type: 'html', content: line });
        } else if (trimmed === '') {
            // 空行表示段落结束
            if (currentBlock.content.length > 0) {
                blocks.push({ ...currentBlock });
                currentBlock = { type: 'text', content: [] };
            }
        } else {
            currentBlock.content.push(line);
        }
    });
    
    // 保存最后一个块
    if (currentBlock.content.length > 0) {
        blocks.push(currentBlock);
    }
    
    // 重新组装HTML
    html = blocks.map(block => {
        if (block.type === 'html') {
            return block.content.join('\n');
        } else {
            const content = block.content.join('\n').trim();
            if (content) {
                return `<p>${content}</p>`;
            }
            return '';
        }
    }).join('\n');
    
    // 清理空的段落
    html = html.replace(/<p>\s*<\/p>/g, '');
    
    return html;
}

// 如果直接运行此脚本
if (require.main === module) {
    const inputFile = process.argv[2];
    const outputFile = process.argv[3];
    
    if (!inputFile) {
        console.log('用法: node convert-md.js <input.md> [output.html]');
        process.exit(1);
    }
    
    const mdContent = fs.readFileSync(inputFile, 'utf-8');
    const result = parseMarkdown(mdContent);
    
    const output = outputFile || inputFile.replace('.md', '.html');
    fs.writeFileSync(output, result.html);
    
    console.log(`转换完成: ${inputFile} -> ${output}`);
}

module.exports = { parseMarkdown };
