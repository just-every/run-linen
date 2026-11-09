from pathlib import Path
import re
root=Path.cwd()
s=(root/'tests/work/runtime.mjs').read_text()
s=re.sub(r"from (['\"])\./([^'\"]+)\1",lambda m:'from '+repr(str(root/'tests/work'/m[2])),s)
s=s.replace('root = new URL("../../", import.meta.url).pathname;', 'root = '+repr(str(root))+';')
clock="""const RealDate=Date;const shift=Date.parse('2026-11-08T21:20:00Z')-RealDate.now();globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[RealDate.now()+shift]));}static now(){return RealDate.now()+shift;}};"""
s=s.replace('const dir = await mkdtemp',clock+'\nconst dir = await mkdtemp')
s=s.replace('  bundle: true,','  bundle: true,\n  banner: {js: `const RealDate=Date;const shift=${shift};globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[RealDate.now()+shift]));}static now(){return RealDate.now()+shift;}};`},')
s=s.replace('  return { status: response.status, value, headers: response.headers };','''  if(path.includes('/search?q=synthetic-linen-20')) {
    console.log('SEARCH_DIAGNOSTIC',JSON.stringify({path,value,at:new Date().toISOString()}));
    const db=await mf.getD1Database('DB');
    for(const item of value.items??[])if(item.type==='ticket') {
      console.log('MATCHED_WORK',JSON.stringify(await db.prepare('SELECT * FROM work_records WHERE id=?').bind(item.id).first()));
      console.log('MATCHED_MESSAGES',JSON.stringify((await db.prepare('SELECT body,visibility FROM work_messages WHERE work_id=?').bind(item.id).all()).results));
    }
  }
  return { status: response.status, value, headers: response.headers };''')
Path('/tmp/linen-clock-runtime.mjs').write_text(s)
