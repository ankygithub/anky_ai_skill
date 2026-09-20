/**
 * 封面/图标风格解析（build-epub-pro / build / build-reader 共用）
 *
 * 素材库结构（由 init-project.js 从技能 icon/ 目录整库复制）：
 *   cover-images/library/科技长方形.jpg ...（竖版 ≈2:3，EPUB 封面用）
 *   cover-images/library/科技正方形.jpg ...（1:1，HTML/reader 图标用）
 *
 * 选择优先级：
 *   1. 显式文件覆盖：cover-images/cover.*（竖版封面）、cover-images/icon.*（方形图标）
 *   2. 显式指定风格：CLI --cover-style > version.json.coverStyle
 *   3. 书名/副标题关键词自动匹配（按科技→书券→复古→素雅→日系→清新顺序）
 *   4. 兜底默认：素雅
 */

const fs = require('fs');
const path = require('path');

// 风格注册表：keywords 用于书名自动识别，顺序即匹配优先级
const STYLES = {
  科技: {
    portrait: '科技长方形.jpg',
    square: '科技正方形.jpg',
    keywords: [
      'python', 'java', 'javascript', 'typescript', 'golang', 'rust', 'c++', 'c#',
      '编程', '代码', '程序', '开发', '软件', '工程师', '算法', '数据结构',
      '人工智能', '大模型', '机器学习', '深度学习', '互联网', '架构', '云计算',
      'docker', 'linux', '数据库', '爬虫', '前端', '后端', '全栈', '运维',
    ],
  },
  书券: {
    portrait: '书券长方形.jpg',
    square: '书券正方形.jpg',
    keywords: ['典藏', '精装', '纪念', '文集', '全集', '年报', '年度报告', '礼品', '鉴赏', '珍藏'],
  },
  复古: {
    portrait: '复古长方形.jpg',
    square: '复古正方形.jpg',
    keywords: ['历史', '国学', '古典', '诗词', '论语', '诗经', '传统文化', '哲学', '名著', '经典', '文学'],
  },
  素雅: {
    portrait: '素雅长方形.jpg',
    square: '素雅正方形.jpg',
    keywords: ['学术', '研究', '论文', '教材', '原理', '方法论', '手册', '指南', '白皮书', '工具书', '思想'],
  },
  日系: {
    portrait: '日系风格.jpg',
    square: '日系正方形.jpg',
    keywords: ['小说', '散文', '随笔', '治愈', '日常', '旅行', '美食', '手帐', '青春', '生活'],
  },
  清新: {
    portrait: '清新长方形.jpg',
    square: '清新正方形.jpg',
    keywords: ['科普', '启蒙', '亲子', '少儿', '儿童', '成长', '学习', '思维', '教育', '入门', '自然'],
  },
};

// 兜底风格：素雅（极简线稿，中性适配面最广）
const DEFAULT_STYLE = '素雅';

/**
 * 在目录中找前缀匹配的图片文件（如 cover.* / icon.*）
 */
function findExplicitImage(dir, prefix) {
  if (!fs.existsSync(dir)) return null;
  const hit = fs.readdirSync(dir).find(f => {
    return f.toLowerCase().startsWith(prefix) && /\.(jpg|jpeg|png|webp)$/i.test(f);
  });
  return hit ? path.join(dir, hit) : null;
}

/**
 * 按关键词匹配风格；无命中返回 null
 */
function detectStyle(text) {
  const t = (text || '').toLowerCase();
  for (const [name, cfg] of Object.entries(STYLES)) {
    if (cfg.keywords.some(k => t.includes(k))) return name;
  }
  return null;
}

/**
 * 解析封面/图标资源
 * @param {object} opts
 * @param {string} opts.projectDir   项目根目录
 * @param {string} [opts.title]      书名（自动识别用）
 * @param {string} [opts.subtitle]   副标题（自动识别用）
 * @param {string} [opts.styleHint]  CLI --cover-style 传入
 * @param {string} [opts.coverStyle] version.json 里的 coverStyle
 * @returns {{style:string, source:string, portraitPath:string|null, squarePath:string|null}}
 */
function resolveCover(opts) {
  const coverDir = path.join(opts.projectDir, 'cover-images');
  const libraryDir = path.join(coverDir, 'library');

  // 1. 显式文件覆盖（用户手工放置，优先级最高）
  const explicitPortrait = findExplicitImage(coverDir, 'cover');
  const explicitSquare = findExplicitImage(coverDir, 'icon');
  if (explicitPortrait || explicitSquare) {
    return {
      style: opts.styleHint || opts.coverStyle || '自定义',
      source: 'explicit-file',
      portraitPath: explicitPortrait,
      squarePath: explicitSquare,
    };
  }

  // 2. 显式指定风格
  let style = null;
  let source = '';
  const hint = (opts.styleHint || opts.coverStyle || '').trim();
  if (hint) {
    const key = Object.keys(STYLES).find(k => k === hint || hint.includes(k));
    if (key) {
      style = key;
      source = opts.styleHint ? 'cli' : 'version.json';
    } else {
      console.warn(`⚠️ 未知封面风格 "${hint}"，可选: ${Object.keys(STYLES).join(' / ')}；改为自动识别`);
    }
  }

  // 3. 书名/副标题关键词自动识别
  if (!style) {
    style = detectStyle(`${opts.title || ''} ${opts.subtitle || ''}`);
    if (style) source = 'auto-keyword';
  }

  // 4. 兜底默认
  if (!style) {
    style = DEFAULT_STYLE;
    source = 'default';
  }

  const cfg = STYLES[style];
  const portraitPath = path.join(libraryDir, cfg.portrait);
  const squarePath = path.join(libraryDir, cfg.square);
  if (!fs.existsSync(portraitPath)) {
    console.warn(`⚠️ 未找到封面库文件 cover-images/library/${cfg.portrait}`);
    console.warn('   新项目由 init-project.js 自动复制；老项目请手动复制技能 icon/ 目录到 cover-images/library/');
  }
  return {
    style,
    source,
    portraitPath: fs.existsSync(portraitPath) ? portraitPath : null,
    squarePath: fs.existsSync(squarePath) ? squarePath : null,
  };
}

module.exports = { STYLES, DEFAULT_STYLE, resolveCover, detectStyle };
