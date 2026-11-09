from pathlib import Path
root=Path.cwd()
s=(root/'tests/work/runtime.mjs').read_text()
s=s[:s.index('  await historyErasureChecks(api,db);')]+'''  await applicationChecks(api,db);
  await lifecycleTemplateChecks(api,db);
  console.log('PASS focused application authority and lifecycle privacy');
} finally {
  await mf.dispose();
  await rm(dir, {recursive:true,force:true});
}
'''
import re
s=re.sub(r"from (['\"])\./([^'\"]+)\1",lambda m:'from '+repr(str(root/'tests/work'/m[2])),s)
s=s.replace('root = new URL("../../", import.meta.url).pathname;', 'root = '+repr(str(root))+';')
s=s.replace('  return { status: response.status, value, headers: response.headers };','''  if(path.includes('/search?q=synthetic-linen-20')) {
    console.log('SEARCH_DIAGNOSTIC',JSON.stringify({path,value}));
    const db=await mf.getD1Database('DB');
    for(const item of value.items??[])if(item.type==='ticket') {
      console.log('MATCHED_WORK',JSON.stringify(await db.prepare('SELECT * FROM work_records WHERE id=?').bind(item.id).first()));
      console.log('MATCHED_MESSAGES',JSON.stringify((await db.prepare('SELECT body,visibility FROM work_messages WHERE work_id=?').bind(item.id).all()).results));
    }
  }
  return { status: response.status, value, headers: response.headers };''')
Path('/tmp/linen-focused.mjs').write_text(s)
