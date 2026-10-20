
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');

const { createWordReport } = require('./utils/generateDocx');
const { createPdfReport } = require('./utils/generatePdf');
const { createPptReport } = require('./utils/generatePptx');
const { THEMES, clean, safeArray } = require('./utils/common');

const app = express();

app.use(express.static('public'));
app.use(express.json({ limit: '3mb' }));

// إعداد رفع الصور
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 8 * 1024 * 1024,
        files: 8
    },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/png', 'image/jpeg'];
        cb(null, allowed.includes(file.mimetype));
    }
});

// إعداد Gemini
const ai = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY
    })
    : null;

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

// صيغ التصدير
const formats = {
    docx: {
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fn: createWordReport
    },
    pdf: {
        mime: 'application/pdf',
        fn: createPdfReport
    },
    pptx: {
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        fn: createPptReport
    }
};

// تنظيف بيانات التقرير ومنع التكرار
function normalizeReport(data) {
    const unique = new Set();

    const distinct = (items) =>
        safeArray(items)
            .map(clean)
            .filter((text) => {
                const key = text.replace(/\s+/g, ' ').toLowerCase();

                if (!key || unique.has(key)) {
                    return false;
                }

                unique.add(key);
                return true;
            });

    const sections = safeArray(data.sections)
        .slice(0, 18)
        .map((section) => ({
            title: clean(section.title),
            paragraphs: distinct(section.paragraphs),
            points: distinct(section.points)
        }))
        .filter(
            (section) =>
                section.title &&
                (section.paragraphs.length || section.points.length)
        );

    return {
        title: clean(data.title) || 'تقرير',
        subtitle: clean(data.subtitle),

        basicInfo: safeArray(data.basicInfo)
            .filter(
                (item) =>
                    item &&
                    clean(item.label) &&
                    clean(item.value)
            )
            .map((item) => ({
                label: clean(item.label),
                value: clean(item.value)
            })),

        introduction: clean(data.introduction),
        sections,
        conclusion: clean(data.conclusion),
        nextSteps: distinct(data.nextSteps)
    };
}

// إنشاء محتوى التقرير باستخدام Gemini
async function generateContent(notes, detail) {
    if (!ai) {
        throw new Error('مفتاح Gemini غير موجود في ملف .env');
    }

    const levels = {
        brief: 'مختصر: 3 إلى 4 أقسام، فقرات موجزة',
        normal: 'متوسط: 4 إلى 6 أقسام مع أمثلة مناسبة',
        detailed: 'مفصل: 6 إلى 9 أقسام وشرح المفاهيم والأنواع والخطوات والأمثلة ذات الصلة'
    };

    const prompt = `
أنت كاتب تقارير عربي متخصص.

افهم موضوع المستخدم، وحدد نوع التقرير، واختر عناوين مناسبة له لا عناوين ثابتة.

مستوى التفصيل:
${levels[detail] || levels.normal}

اكتب تقريرًا عربيًا فصيحًا ومترابطًا، يشرح المفاهيم الأساسية والأنواع والآليات والأمثلة الواقعية العامة عندما يكون الموضوع تعليميًا أو تقنيًا.

مثال:
إذا ذكر المستخدم التدريب في الشبكات، اشرح مفهوم الشبكات وأنواع LAN وWAN وWLAN، والأجهزة مثل switch/router، وعناوين IP، وطرق استكشاف الأعطال؛ لكن لا تدّع أنه نفّذ مهمة لم يذكرها.

إذا كان التقرير عن الحضور والغياب، اشرح آلية تسجيل الحضور ودور المدرس والنظام الإلكتروني بصفة عامة دون اختراع اسم منصة.

تجنب تكرار الأفكار والعبارات بين الفقرات والنقاط.

استخدم نقاطًا فقط للقوائم الحقيقية.

لا تختلق أسماء أو تواريخ أو إحصاءات أو سياسات أو إنجازات أو تجارب شخصية.

أي تفاصيل خاصة بالمستخدم يجب أن تكون في نصه حرفيًا أو مستنتجة منه بشكل واضح.

ضع معلوماته التعريفية المذكورة فقط في basicInfo.

لا تكتب الخطوات القادمة إلا إذا ذكر المستخدم خططًا فعلية.

أعد JSON فقط بهذه البنية:

{
  "title": "",
  "subtitle": "",
  "basicInfo": [
    {
      "label": "",
      "value": ""
    }
  ],
  "introduction": "",
  "sections": [
    {
      "title": "",
      "paragraphs": [""],
      "points": [""]
    }
  ],
  "conclusion": "",
  "nextSteps": []
}

نص المستخدم:
${notes}
`;

    const maxAttempts = 4;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const result = await ai.models.generateContent({
                model: MODEL,
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    temperature: 0.35
                }
            });

            const report = normalizeReport(
                JSON.parse(result.text)
            );

            if (!report.sections.length) {
                throw new Error('التقرير المولد فارغ');
            }

            return report;

        } catch (err) {
            const status = Number(
                err.status || err.code || err.error?.code || 0
            );

            const retryable = [429, 500, 502, 503, 504]
                .includes(status);

            const lastAttempt = attempt === maxAttempts - 1;

            if (!retryable || lastAttempt) {
                throw err;
            }

            const delay = (attempt + 1) * 3000;

            console.log(
                `Gemini error ${status}. Retrying in ${delay / 1000}s...`
            );

            await new Promise((resolve) =>
                setTimeout(resolve, delay)
            );
        }
    }
}

// معالجة الأخطاء داخل المسارات
const wrap = (handler) => (req, res, next) =>
    Promise.resolve(handler(req, res)).catch(next);

// معاينة التقرير
app.post('/api/preview', wrap(async (req, res) => {
    const notes = clean(req.body.notes);

    if (!notes || notes.length > 12000) {
        return res.status(400).json({
            error: 'اكتبي نصًا لا يتجاوز 12000 حرف.'
        });
    }

    const report = await generateContent(
        notes,
        req.body.detail
    );

    res.json({ report });
}));

// تصدير التقرير
app.post(
    '/api/export',
    upload.array('images', 8),
    wrap(async (req, res) => {
        const format = clean(req.body.format);

        if (!formats[format]) {
            return res.status(400).json({
                error: 'نوع الملف غير مدعوم.'
            });
        }

        let parsed;

        try {
            parsed = JSON.parse(req.body.report || '');
        } catch {
            return res.status(400).json({
                error: 'بيانات التقرير غير صحيحة.'
            });
        }

        const report = normalizeReport(parsed);

        if (!report.sections.length) {
            return res.status(400).json({
                error: 'لا توجد أقسام للتصدير.'
            });
        }

        const options = {
            theme: THEMES[req.body.theme]
                ? req.body.theme
                : 'formal',

            images: (req.files || []).map((file) => ({
                buffer: file.buffer,
                mimeType: file.mimetype
            }))
        };

        const buffer = await formats[format].fn(
            report,
            options
        );

        res.set('Content-Type', formats[format].mime);

        res.set(
            'Content-Disposition',
            `attachment; filename="smart-report.${format}"`
        );

        res.send(buffer);
    })
);

// فحص حالة السيرفر
app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        aiConfigured: !!ai
    });
});

// معالجة الأخطاء
app.use((err, req, res, next) => {
    console.error('Report error:', err.message);

    const errorCode = Number(
        err.status || err.code || err.error?.code || 0
    );

    let status = 500;
    let message = 'تعذر إكمال العملية. راجعي نافذة السيرفر.';

    if (err instanceof multer.MulterError) {
        status = 400;
        message = 'تأكدي من حجم الصور (8MB لكل صورة، 8 صور كحد أقصى).';
    } else if (errorCode === 429 || errorCode === 503) {
        status = 503;
        message = 'خدمة الذكاء الاصطناعي مشغولة حاليًا، أعيدي المحاولة لاحقًا.';
    } else if (errorCode === 404) {
        status = 502;
        message = 'نموذج Gemini المحدد غير متاح. تحققي من اسم النموذج.';
    } else if (err.message === 'مفتاح Gemini غير موجود في ملف .env') {
        message = err.message;
    }

    res.status(status).json({ error: message });
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
