const $=id=>document.getElementById(id);
let report=null;
const setStatus=(msg,error=false)=>{$('status').textContent=msg;$('status').classList.toggle('error',error);};
const busy=(on)=>{for(const id of ['previewBtn','exportBtn'])$(id).disabled=on;};
const field=(parent,label,value,onChange,multi=true)=>{
  const wrap=document.createElement('div');wrap.className='edit-group';
  const title=document.createElement('label');title.textContent=label;wrap.appendChild(title);
  const input=document.createElement(multi?'textarea':'input');input.value=value||'';
  input.addEventListener('input',()=>onChange(input.value));wrap.appendChild(input);parent.appendChild(wrap);
};
function renderEditor(){
  const editor=$('editor');editor.replaceChildren();
  field(editor,'عنوان التقرير',report.title,v=>report.title=v,false);
  field(editor,'العنوان الفرعي',report.subtitle,v=>report.subtitle=v,false);
  report.basicInfo.forEach((info,i)=>{
    field(editor,`البيانات الأساسية ${i+1} — ${info.label}`,info.value,v=>info.value=v,false);
  });
  field(editor,'المقدمة',report.introduction,v=>report.introduction=v);
  report.sections.forEach((section,i)=>{
    const box=document.createElement('div');box.className='edit-group';
    const h=document.createElement('h3');h.textContent=`القسم ${i+1}`;box.appendChild(h);
    field(box,'عنوان القسم',section.title,v=>section.title=v,false);
    section.paragraphs.forEach((p,j)=>field(box,`الفقرة ${j+1}`,p,v=>section.paragraphs[j]=v));
    section.points.forEach((p,j)=>field(box,`النقطة ${j+1}`,p,v=>section.points[j]=v));
    editor.appendChild(box);
  });
  field(editor,'الخاتمة',report.conclusion,v=>report.conclusion=v);
  report.nextSteps.forEach((p,i)=>field(editor,`الخطوة القادمة ${i+1}`,p,v=>report.nextSteps[i]=v));
}
$('previewBtn').addEventListener('click',async()=>{
  const notes=$('notes').value.trim();if(!notes)return setStatus('اكتبي موضوع التقرير أولًا.',true);
  busy(true);setStatus('جاري فهم الموضوع وإنشاء المحتوى...');
  try{
    const response=await fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({notes,detail:$('detail').value})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'فشل إنشاء التقرير');
    report=data.report;renderEditor();$('editorSection').hidden=false;$('exportSection').hidden=false;
    setStatus('التقرير جاهز للمراجعة. عدّلي النص ثم اختاري نوع الملف.');
    $('editorSection').scrollIntoView({behavior:'smooth'});
  }catch(e){setStatus(e.message,true);}finally{busy(false);}
});
$('reportImages').addEventListener('change',()=>{
  const files=Array.from($('reportImages').files);
  if(files.length>8||files.some(f=>f.size>8*1024*1024||!['image/png','image/jpeg'].includes(f.type))){
    $('reportImages').value='';$('imagesPreview').replaceChildren();return setStatus('اختاري حتى 8 صور JPG/PNG، حجم كل صورة أقل من 8MB.',true);
  }
  const preview=$('imagesPreview');preview.replaceChildren();
  files.forEach(file=>{const img=document.createElement('img');const url=URL.createObjectURL(file);img.src=url;img.alt=file.name;img.onload=()=>URL.revokeObjectURL(url);preview.appendChild(img);});
});
$('exportBtn').addEventListener('click',async()=>{
  if(!report)return setStatus('أنشئي التقرير أولًا.',true);
  busy(true);setStatus('جاري تجهيز الملف...');
  try{
    const data=new FormData();data.append('report',JSON.stringify(report));data.append('format',$('format').value);data.append('theme',$('theme').value);
    for(const file of $('reportImages').files)data.append('images',file);
    const response=await fetch('/api/export',{method:'POST',body:data});
    if(!response.ok){let error='فشل التصدير';try{error=(await response.json()).error||error;}catch{}throw new Error(error);}
    const blob=await response.blob();if(!blob.size)throw new Error('الملف فارغ');
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`تقرير_ذكي.${$('format').value}`;
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
    setStatus('تم تجهيز التقرير وتحميله.');
  }catch(e){setStatus(e.message,true);}finally{busy(false);}
});
