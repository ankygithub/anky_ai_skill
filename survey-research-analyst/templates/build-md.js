#!/usr/bin/env node

/**
 * Markdown报告构建脚本
 * 合并所有Markdown片段，生成单文件Markdown报告
 */

const fs = require('fs');
const path = require('path');

function buildMarkdownReport() {
    console.log('开始构建Markdown报告...\n');
    
    // 1. 读取项目信息
    console.log('1. 读取项目信息...');
    const projectInfoPath = path.join(process.cwd(), 'project-info.md');
    let projectInfo = {
        title: '调研报告',
        subtitle: '',
        type: '调研报告',
        version: '1.0.0'
    };
    
    if (fs.existsSync(projectInfoPath)) {
        const content = fs.readFileSync(projectInfoPath, 'utf-8');
        const titleMatch = content.match(/Title:\s*(.+)/);
        const subtitleMatch = content.match(/Subtitle:\s*(.+)/);
        const typeMatch = content.match(/Type:\s*(.+)/);
        const versionMatch = content.match(/Version:\s*(.+)/);
        
        if (titleMatch) projectInfo.title = titleMatch[1].trim();
        if (subtitleMatch) projectInfo.subtitle = subtitleMatch[1].trim();
        if (typeMatch) projectInfo.type = typeMatch[1].trim();
        if (versionMatch) projectInfo.version = versionMatch[1].trim();
    }
    
    // 2. 读取所有Markdown文档
    console.log('2. 读取Markdown文档...');
    const docsDir = path.join(process.cwd(), 'docs');
    let mainContent = '';
    
    if (fs.existsSync(docsDir)) {
        const docFiles = fs.readdirSync(docsDir)
            .filter(f => f.endsWith('.md'))
            .sort();
        
        console.log(`   找到 ${docFiles.length} 个文档文件`);
        
        docFiles.forEach((file) => {
            console.log(`   处理: ${file}`);
            const filePath = path.join(docsDir, file);
            const mdContent = fs.readFileSync(filePath, 'utf-8');
            
            // 移除YAML frontmatter
            let cleanContent = mdContent.replace(/^---\n[\s\S]*?\n---\n/, '');
            
            // 添加到主内容
            mainContent += `\n<!-- ${file} -->\n\n`;
            mainContent += cleanContent;
            mainContent += '\n\n---\n';
        });
    }
    
    // 3. 读取数据来源
    console.log('3. 读取数据来源...');
    const sourcesPath = path.join(process.cwd(), 'sources', 'sources.md');
    let dataSources = '';
    if (fs.existsSync(sourcesPath)) {
        const sourcesContent = fs.readFileSync(sourcesPath, 'utf-8');
        // 移除YAML frontmatter
        dataSources = sourcesContent.replace(/^---\n[\s\S]*?\n---\n/, '');
    }
    
    // 4. 生成报告头部
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const year = now.getFullYear();
    
    let report = `# ${projectInfo.title}\n\n`;
    if (projectInfo.subtitle) {
        report += `> ${projectInfo.subtitle}\n\n`;
    }
    report += `- **报告类型**: ${projectInfo.type}\n`;
    report += `- **版本**: ${projectInfo.version}\n`;
    report += `- **生成日期**: ${dateStr}\n`;
    report += `- **生成工具**: Survey Research Analyst\n\n`;
    report += '---\n\n';
    
    // 5. 添加目录
    report += '## 目录\n\n';
    if (fs.existsSync(docsDir)) {
        const docFiles = fs.readdirSync(docsDir)
            .filter(f => f.endsWith('.md'))
            .sort();
        
        docFiles.forEach((file, index) => {
            const filePath = path.join(docsDir, file);
            const mdContent = fs.readFileSync(filePath, 'utf-8');
            const titleMatch = mdContent.match(/^---\n[\s\S]*?title:\s*(.+?)\n/);
            const title = titleMatch ? titleMatch[1] : path.basename(file, '.md');
            report += `${index + 1}. [${title}](#${title.toLowerCase().replace(/\s+/g, '-')})\n`;
        });
    }
    report += '\n---\n\n';
    
    // 6. 添加主内容
    report += mainContent;
    
    // 7. 添加数据来源
    if (dataSources) {
        report += '\n# 数据来源\n\n';
        report += dataSources;
    }
    
    // 8. 添加页脚
    report += '\n---\n\n';
    report += `*本报告由 Survey Research Analyst 生成*\n`;
    report += `*© ${year} 调研分析报告*\n`;
    
    // 9. 写入输出文件
    console.log('4. 写入输出文件...');
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 使用项目名称作为文件名
    const projectName = projectInfo.title || 'report';
    const safeProjectName = projectName.replace(/[\\/:*?"<>|]/g, '_');
    const outputFileName = `${safeProjectName}_report.md`;
    const outputPath = path.join(outputDir, outputFileName);
    fs.writeFileSync(outputPath, report);
    
    console.log('\n✓ Markdown构建完成！');
    console.log(`输出文件: ${outputPath}`);
    console.log(`文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
}

// 执行构建
buildMarkdownReport();
