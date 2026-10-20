const THEMES = {
  formal: {name:'رسمي', primary:'17365D', accent:'2F75B5', light:'EAF3FA'},
  academic: {name:'أكاديمي', primary:'243B67', accent:'5B73C4', light:'EEF1FB'},
  modern: {name:'عصري', primary:'115E59', accent:'0F766E', light:'E7F8F4'},
  technical: {name:'تقني', primary:'0F172A', accent:'475569', light:'F1F5F9'}
};
const themeOf = key => THEMES[key] || THEMES.formal;
const clean = v => String(v ?? '').trim();
const safeArray = v => Array.isArray(v) ? v : [];
const escapeHtml = v => clean(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imageData = image => `data:${image.mimeType};base64,${image.buffer.toString('base64')}`;
module.exports = {THEMES,themeOf,clean,safeArray,escapeHtml,imageData};
