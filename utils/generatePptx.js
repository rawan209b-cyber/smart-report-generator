
const PptxGenJS = require('pptxgenjs');
const sharp = require('sharp');
const { themeOf, safeArray, clean, imageData } = require('./common');

const W = 13.333;
const H = 7.5;

// تقسيم النص دون حذف المعلومات
function splitLong(text, max = 280) {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const parts = [];
  let current = '';

  for (const word of words) {
    if (current && (current + ' ' + word).length > max) {
      parts.push(current);
      current = '';
    }
    current += (current ? ' ' : '') + word;
  }

  if (current) parts.push(current);
  return parts;
}

// تجميع الفقرات والنقاط بحسب المساحة
function paginate(items, maxChars = 680, maxItems = 5) {
  const pages = [];
  let page = [];
  let length = 0;

  for (const item of items) {
    const pieces = splitLong(item.text, 280);

    for (const piece of pieces) {
      if (
        page.length &&
        (page.length >= maxItems || length + piece.length > maxChars)
      ) {
        pages.push(page);
        page = [];
        length = 0;
      }

      page.push({ text: piece, bullet: item.bullet });
      length += piece.length;
    }
  }

  if (page.length) pages.push(page);
  return pages;
}

async function createPptReport(report, options = {}) {
  const pptx = new PptxGenJS();

  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Smart Report Generator';
  pptx.subject = clean(report.title);
  pptx.lang = 'ar-SA';

  const t = themeOf(options.theme);

  const addText = (slide, text, opts = {}) => {
    slide.addText(clean(text), {
      fontFace: 'Arial',
      rtlMode: true,
      align: 'right',
      margin: 0.08,
      color: t.primary,
      breakLine: false,
      ...opts
    });
  };

  // إنشاء التصميم الأساسي لكل شريحة
  function baseSlide(title) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };

    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: W, h: 0.15,
      line: { color: t.accent },
      fill: { color: t.accent }
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 12.75, y: 0.15, w: 0.58, h: 7.35,
      line: { color: t.light },
      fill: { color: t.light }
    });

    addText(slide, title, {
      x: 0.8, y: 0.45, w: 11.65, h: 0.72,
      fontSize: 25, bold: true,
      fit: 'shrink'
    });

    slide.addShape(pptx.ShapeType.line, {
      x: 0.8, y: 1.3, w: 11.6, h: 0,
      line: { color: t.accent, width: 1.5 }
    });

    addText(slide, 'مولد التقارير الذكي', {
      x: 0.8, y: 7.1, w: 3.8, h: 0.22,
      fontSize: 9, color: '667085'
    });

    addText(slide, String(pptx._slides.length), {
      x: 11.8, y: 7.08, w: 0.45, h: 0.25,
      fontSize: 10, color: '667085',
      align: 'center', rtlMode: false
    });

    return slide;
  }

  // عرض عدة فقرات أو نقاط في شريحة واحدة
  function contentSlide(title, items) {
    const slide = baseSlide(title);

    const gap = 0.14;
    const available = 5.15;
    const cardH = Math.min(
      1.55,
      (available - gap * (items.length - 1)) / items.length
    );

    const totalH = items.length * cardH +
      (items.length - 1) * gap;

    let y = 1.58 + Math.max(0, (available - totalH) / 2);

    items.forEach((item) => {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.88, y, w: 11.45, h: cardH,
        rectRadius: 0.07,
        line: { color: t.light },
        fill: { color: t.light }
      });

      // شريط جانبي مميز للنقاط
      if (item.bullet) {
        slide.addShape(pptx.ShapeType.rect, {
          x: 12.12, y: y + 0.15,
          w: 0.055, h: cardH - 0.3,
          line: { color: t.accent },
          fill: { color: t.accent }
        });
      }

      const len = item.text.length;
      const fontSize = len > 240 ? 15 :
        len > 160 ? 16 : 18;

      addText(slide, item.text, {
        x: 1.15,
        y: y + 0.12,
        w: 10.75,
        h: cardH - 0.24,
        fontSize,
        color: '263238',
        valign: 'mid',
        fit: 'shrink',
        breakLine: false
      });

      y += cardH + gap;
    });
  }

  // إنشاء شرائح القسم مع منع الشرائح الفارغة
  function addSection(title, paragraphs = [], points = []) {
    const items = [
      ...safeArray(paragraphs)
        .map(text => ({ text: clean(text), bullet: false })),
      ...safeArray(points)
        .map(text => ({ text: clean(text), bullet: true }))
    ].filter(item => item.text);

    const pages = paginate(items);

    pages.forEach((page, index) => {
      const heading = index === 0
        ? title
        : `${title} — تابع`;

      contentSlide(heading, page);
    });
  }

  // الغلاف
  const cover = pptx.addSlide();
  cover.background = { color: t.primary };

  cover.addShape(pptx.ShapeType.rect, {
    x: 11.55, y: 0, w: 1.78, h: H,
    line: { color: t.accent },
    fill: { color: t.accent }
  });

  addText(cover, 'SMART REPORT', {
    x: 1, y: 1.2, w: 9.5, h: 0.4,
    fontSize: 16, color: 'FFFFFF'
  });

  addText(cover, report.title || 'تقرير', {
    x: 1, y: 2, w: 9.7, h: 1.8,
    fontSize: 34, bold: true,
    color: 'FFFFFF', fit: 'shrink'
  });

  if (report.subtitle) {
    addText(cover, report.subtitle, {
      x: 1, y: 4.1, w: 9.7, h: 1.1,
      fontSize: 18, color: 'FFFFFF',
      fit: 'shrink'
    });
  }

  // البيانات الأساسية
  if (report.basicInfo?.length) {
    addSection(
      'البيانات الأساسية',
      report.basicInfo.map(
        item => `${clean(item.label)}: ${clean(item.value)}`
      )
    );
  }

  // المقدمة
  if (report.introduction) {
    addSection('مقدمة', [report.introduction]);
  }

  // دمج فقرات كل قسم ونقاطه
  for (const section of safeArray(report.sections)) {
    addSection(
      clean(section.title) || 'موضوع',
      section.paragraphs,
      section.points
    );
  }

  // عرض الصور المرفوعة مع الحفاظ على أبعادها
  const images = safeArray(options.images);

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const slide = baseSlide(`الصور المرفقة — ${i + 1}`);

    const meta = await sharp(img.buffer).metadata();
    const width = meta.width || 1000;
    const height = meta.height || 600;

    const maxW = 10.8;
    const maxH = 5.25;
    const scale = Math.min(maxW / width, maxH / height);

    const iw = width * scale;
    const ih = height * scale;

    slide.addImage({
      data: imageData(img),
      x: (W - iw) / 2,
      y: 1.55 + (maxH - ih) / 2,
      w: iw,
      h: ih
    });
  }

  // الخطوات القادمة
  if (report.nextSteps?.length) {
    addSection(
      'الخطوات القادمة',
      [],
      report.nextSteps
    );
  }

  // الخاتمة
  if (report.conclusion) {
    addSection('الخاتمة', [report.conclusion]);
  }

  return pptx.write({
    outputType: 'nodebuffer'
  });
}

module.exports = { createPptReport };
