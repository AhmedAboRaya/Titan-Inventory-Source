import { Database } from './db';
import { PERMISSIONS } from './common';
export const TREE:[string,string,string,string[]][]=[
 ['CNC Cutting Tools','أدوات قطع CNC','cutting',['Drills','End Mills','Thread Mills','Taps','Inserts','Micro Turning Tools','Carbide Saws']],
 ['Machine Accessories','إكسسوارات الماكينات','accessories',['Collets','Guide Bushes','Finger Chucks','Tool Holders','Rotary Broaches','Whirling / Polygon Units']],
 ['Raw Materials','الخامات','materials',['Titanium','Stainless Steel','Brass','Acrylic','Teflon','Plastic Materials']],
 ['Packaging Materials','مواد التغليف','packaging',['Stickers','Pouches','Ampoules','Holders','Protective Packages','IFU']],
 ['Chemicals','الكيماويات','chemicals',['Alcohols','Acids','Alkaline / Neutral Detergents','Anodization Materials']],
 ['Cleanroom Supplies','مستلزمات الغرف النظيفة','cleanroom',['Gloves','Masks','Gowns','Head Covers','Shoe Covers']],
 ['Spare Parts & Devices','قطع الغيار والأجهزة','spares',['Bearings','Filters','Drives','Encoders','Transmission Parts','Devices']],
 ['General Tools','الأدوات العامة','tools',['Scissors','Forceps','Cutters','General Workshop Tools']],
 ['Office & General Supplies','مستلزمات المكتب','office',['Paper','Stationery','Batteries','General Consumables']],
 ['Uniforms','الملابس','uniforms',['Coats','T-Shirts','Trousers','Hygiene Uniforms']]
];
export async function seed(db:Database){await db.transaction(async tx=>{
  const roles:Record<string,string[]>={admin:[...PERMISSIONS],manager:PERMISSIONS.filter(p=>p!=='users'&&p!=='settings'),storekeeper:['catalog.read','stock.read','receipt','issue','transfer','reserve','custody','count','reports'],purchasing:['catalog.read','stock.read','purchase','receipt','cost.read','reports'],quality:['catalog.read','stock.read','quality','reports'],production:['catalog.read','stock.read','issue','reserve','reports'],finance:['catalog.read','stock.read','cost.read','reports'],auditor:['catalog.read','stock.read','reports']};
  for(const [id,permissions]of Object.entries(roles))await tx.query('INSERT INTO roles(id,name,permissions) VALUES($1,$1,$2) ON CONFLICT DO NOTHING',[id,permissions]);
  if((await tx.query('SELECT 1 FROM categories LIMIT 1')).rows.length)return;
  let sort=0;
  for(const [nameEn,nameAr,illustration,children]of TREE){
    const parent=(await tx.query('INSERT INTO categories(name_en,name_ar,illustration,sort) VALUES($1,$2,$3,$4) RETURNING id',[nameEn,nameAr,illustration,sort++])).rows[0].id;
    let n=0;for(const child of children)await tx.query('INSERT INTO categories(parent_id,name_en,name_ar,illustration,sort) VALUES($1,$2,$2,$3,$4)',[parent,child,`${illustration}-${++n}`,n]);
  }
});}
