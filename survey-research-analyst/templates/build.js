#!/usr/bin/env node

/**
 * HTML报告构建脚本
 * 合并所有Markdown片段，生成单文件HTML报告
 */

const fs = require('fs');
const path = require('path');
const { parseMarkdown } = require('./convert-md.js');

function buildReport() {
    console.log('开始构建报告...\n');
    
    // 1. 读取模板
    console.log('1. 读取HTML模板...');
    const templatePath = path.join(__dirname, 'report-template.html');
    const template = fs.readFileSync(templatePath, 'utf-8');
    
    // 2. 读取项目信息
    console.log('2. 读取项目信息...');
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
    
    // 3. 读取所有Markdown文档
    console.log('3. 读取Markdown文档...');
    const docsDir = path.join(process.cwd(), 'docs');
    let mainContent = '';
    let tocItems = '';
    let executiveSummary = '';
    let keyFindings = '';
    let dataSources = '';
    
    if (fs.existsSync(docsDir)) {
        const docFiles = fs.readdirSync(docsDir)
            .filter(f => f.endsWith('.md'))
            .sort();
        
        console.log(`   找到 ${docFiles.length} 个文档文件`);
        
        docFiles.forEach((file, index) => {
            console.log(`   处理: ${file}`);
            const filePath = path.join(docsDir, file);
            const mdContent = fs.readFileSync(filePath, 'utf-8');
            const result = parseMarkdown(mdContent);
            
            // 提取标题用于目录
            const title = result.frontmatter.title || result.title || path.basename(file, '.md');
            const fileId = `doc-${index}`;
            
            // 生成目录项
            const tocClass = index === 0 ? 'toc-h1' : 'toc-h2';
            tocItems += `<li class="toc-item"><a href="#${fileId}" class="toc-link ${tocClass}">${title}</a></li>\n`;
            
            // 添加到主内容
            mainContent += `\n<!-- ${file} -->\n`;
            mainContent += `<section id="${fileId}">\n`;
            mainContent += result.html;
            mainContent += '\n</section>\n';
            
            // 提取执行摘要（从第一个文档）
            if (index === 0 && result.summary) {
                executiveSummary = result.summary;
            }
        });
    }
    
    // 4. 读取数据来源
    console.log('4. 读取数据来源...');
    const sourcesPath = path.join(process.cwd(), 'sources', 'sources.md');
    if (fs.existsSync(sourcesPath)) {
        const sourcesContent = fs.readFileSync(sourcesPath, 'utf-8');
        const sourcesResult = parseMarkdown(sourcesContent);
        dataSources = sourcesResult.html;
    }
    
    // 5. 读取核心发现
    console.log('5. 读取核心发现...');
    const findingsPath = path.join(process.cwd(), 'docs', '00-key-findings.md');
    if (fs.existsSync(findingsPath)) {
        const findingsContent = fs.readFileSync(findingsPath, 'utf-8');
        const findingsResult = parseMarkdown(findingsContent);
        keyFindings = findingsResult.html;
    }
    
    // 6. 替换模板占位符
    console.log('6. 合并到模板...');
    let report = template;
    
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleString('zh-CN');
    const year = now.getFullYear();
    
    report = report.replace(/{{REPORT_TITLE}}/g, projectInfo.title);
    report = report.replace(/{{REPORT_SUBTITLE}}/g, projectInfo.subtitle);
    report = report.replace(/{{REPORT_TYPE}}/g, projectInfo.type);
    report = report.replace(/{{REPORT_DATE}}/g, dateStr);
    report = report.replace(/{{REPORT_VERSION}}/g, projectInfo.version);
    report = report.replace(/{{TOC_ITEMS}}/g, tocItems);
    report = report.replace(/{{EXECUTIVE_SUMMARY}}/g, executiveSummary);
    report = report.replace(/{{KEY_FINDINGS}}/g, keyFindings);
    report = report.replace(/{{REPORT_CONTENT}}/g, mainContent);
    report = report.replace(/{{DATA_SOURCES}}/g, dataSources);
    report = report.replace(/{{GENERATED_TIME}}/g, timeStr);
    report = report.replace(/{{COPYRIGHT_YEAR}}/g, year);
    
    // 7. 内联CSS样式（生成单文件HTML）
    console.log('7. 内联CSS样式...');
    const cssPath = path.join(__dirname, 'styles.css');
    if (fs.existsSync(cssPath)) {
        const cssContent = fs.readFileSync(cssPath, 'utf-8');
        report = report.replace('<link rel="stylesheet" href="styles.css">', `<style>\n${cssContent}\n</style>`);
    }
    
    // 8. 写入输出文件
    console.log('8. 写入输出文件...');
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 使用项目名称作为文件名
    const projectName = projectInfo.title || 'report';
    const safeProjectName = projectName.replace(/[\\/:*?"<>|]/g, '_');
    const outputFileName = `${safeProjectName}_report.html`;
    const outputPath = path.join(outputDir, outputFileName);
    fs.writeFileSync(outputPath, report);
    
    console.log('\n✓ 构建完成！');
    console.log(`输出文件: ${outputPath}`);
    console.log(`文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
}

// 执行构建
buildReport();
