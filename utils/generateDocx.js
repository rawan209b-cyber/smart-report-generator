const {Document,Paragraph,TextRun,ImageRun,Packer,AlignmentType,HeadingLevel,Table,TableRow,TableCell,WidthType}=require('docx');
const sharp=require('sharp');
const {themeOf,safeArray,clean}=require('./common');
const para=(text,opts={})=>new Paragraph({alignment:opts.center?AlignmentType.CENTER:AlignmentType.RIGHT,bidirectional:true,heading:opts.heading,
  spacing:{before:opts.heading?260:0,after:opts.heading?170:130,line:340},keepNext:!!opts.heading,
  children:[new TextRun({text:clean(text),font:'Arial',size:opts.size||24,bold:!!opts.bold,color:opts.color||'263238',rightToLeft:true})]});
async function createWordReport(report,options={}){
  const t=themeOf(options.theme),children=[];
  children.push(para(report.title,{center:true,size:44,bold:true,color:t.primary}));
  if(report.subtitle)children.push(para(report.subtitle,{center:true,size:25,color:'667085'}));
  if(report.basicInfo?.length){
    children.push(para('البيانات الأساسية',{heading:HeadingLevel.HEADING_1,size:29,bold:true,color:t.primary}));
    children.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:report.basicInfo.map(x=>new TableRow({children:[
      new TableCell({children:[para(x.label,{bold:true,color:t.primary})]}),new TableCell({children:[para(x.value)]})]}))}));
  }
  if(report.introduction){children.push(para('مقدمة',{heading:HeadingLevel.HEADING_1,size:29,bold:true,color:t.primary}));children.push(para(report.introduction));}
  for(const s of safeArray(report.sections)){
    children.push(para(s.title,{heading:HeadingLevel.HEADING_1,size:29,bold:true,color:t.primary}));
    for(const p of safeArray(s.paragraphs))children.push(para(p));
    for(const p of safeArray(s.points))children.push(para('• '+p));
  }
  if(options.images?.length){
    children.push(para('الصور المرفقة',{heading:HeadingLevel.HEADING_1,size:29,bold:true,color:t.primary}));
    for(const image of options.images){
      const meta=await sharp(image.buffer).metadata();
      const ratio=Math.min(1,500/(meta.width||500),320/(meta.height||320));
      children.push(new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:180},children:[new ImageRun({data:image.buffer,type:image.mimeType==='image/png'?'png':'jpg',transformation:{width:Math.max(1,Math.round(meta.width*ratio)),height:Math.max(1,Math.round(meta.height*ratio))}})]}));
    }
  }
  if(report.nextSteps?.length){children.push(para('الخطوات القادمة',{heading:HeadingLevel.HEADING_1,size:29,bold:true,color:t.primary}));report.nextSteps.forEach(p=>children.push(para('• '+p)));}
  if(report.conclusion){children.push(para('الخاتمة',{heading:HeadingLevel.HEADING_1,size:29,bold:true,color:t.primary}));children.push(para(report.conclusion));}
  const doc=new Document({creator:'Smart Report Generator',title:report.title,styles:{default:{document:{run:{font:'Arial',size:24}}}},sections:[{properties:{page:{margin:{top:950,right:950,bottom:950,left:950}}},children}]});
  return Packer.toBuffer(doc);
}
module.exports={createWordReport};
