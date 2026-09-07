exec(open('/tmp/d091-r1-review/probes.py').read().split('results={}')[0])
results={}
def detail(p,r):
    r['reports']=reports(p)
    r['source_files']=[str(f.relative_to(p)) for f in (p/'.specify').rglob('*')]
    return r
# Nested destination and persistent-archive ancestors must stay within the repository.
for label,linkrel,srcrel in [('nested-dest','.sdlc/memory/sub','.specify/memory/sub/a.md'),('archive-root','.sdlc/legacy','.specify/memory/a.md')]:
    p=fixture('r2-'+label);outside=ROOT/('r2-'+label+'-outside');outside.mkdir()
    link=p/linkrel;link.parent.mkdir(parents=True,exist_ok=True);link.symlink_to(outside)
    write(p/srcrel,'ORIGINAL .specify/memory/x\n')
    r=apply(p);r['outside_files']={str(f.relative_to(outside)):f.read_text() for f in outside.rglob('*') if f.is_file()}
    results[label]=detail(p,r)
# Nonregular entry must be C10, never silently omitted by find's type filter.
p=fixture('r2-fifo');(p/'.specify/memory').mkdir(parents=True);os.mkfifo(p/'.specify/memory/data.pipe')
rc,o=run(p,'--adopt-governance-corpus','--plan');results['fifo']={'rc':rc,'plan':o}
# Generation through a dangling *leaf* link.
for complete in [True,False]:
    p=fixture('r2-leaf-'+str(complete),complete);outside=ROOT/('r2-leaf-'+str(complete)+'-outside');outside.mkdir()
    leaf=p/'.sdlc/memory/constitution.md';leaf.parent.mkdir(parents=True);leaf.symlink_to(outside/'owner.md')
    rc,o=run(p);results['leaf-'+str(complete)]={'rc':rc,'tail':o[-800:],'link_preserved':leaf.is_symlink(),'outside_created':(outside/'owner.md').exists()}
# New destination appears during mv: a directory changes mv semantics.
shim=ROOT/'r2-mv-shim';shim.mkdir();write(shim/'mv','''#!/usr/bin/env python3
import os,sys,pathlib
dst=pathlib.Path(sys.argv[-1]);inject=os.environ.get('REVIEW_INJECT_DST')
if str(dst)==inject and not dst.exists():
    dst.mkdir();(dst/'owner.txt').write_text('LATER OWNER\\n')
os.execv('/bin/mv',['/bin/mv']+sys.argv[1:])
''');(shim/'mv').chmod(0o755)
p=fixture('r2-late-directory');write(p/'.specify/memory/a.md','ORIGINAL A\n');write(p/'.specify/memory/z.md','ORIGINAL Z\n')
rc,o=run(p,'--adopt-governance-corpus','--plan');sha=re.search(r'^PLAN_SHA256=(.*)$',o,re.M)[1]
rc,o=run(p,'--adopt-governance-corpus','--apply','--confirm-migration-plan',sha,env={'PATH':str(shim)+':'+os.environ['PATH'],'REVIEW_INJECT_DST':str(p/'.sdlc/memory/z.md')})
results['late-directory']=detail(p,{'rc':rc,'output':o,'nested_source_exists':(p/'.sdlc/memory/z.md/z.md').exists()})
# A later writer replaces a moved prefix before second mv is refused.
shim=ROOT/'r2-prefix-shim';shim.mkdir();write(shim/'mv','''#!/usr/bin/env python3
import os,sys,pathlib
dst=pathlib.Path(sys.argv[-1])
if str(dst)==os.environ.get('REVIEW_INJECT_DST'):
    pathlib.Path(os.environ['REVIEW_PREFIX_DST']).write_text('LATER PREFIX OWNER\\n')
    dst.write_text('LATER CURRENT OWNER\\n')
os.execv('/bin/mv',['/bin/mv']+sys.argv[1:])
''');(shim/'mv').chmod(0o755)
p=fixture('r2-late-prefix');write(p/'.specify/memory/a.md','ORIGINAL A\n');write(p/'.specify/memory/z.md','ORIGINAL Z\n')
rc,o=run(p,'--adopt-governance-corpus','--plan');sha=re.search(r'^PLAN_SHA256=(.*)$',o,re.M)[1]
rc,o=run(p,'--adopt-governance-corpus','--apply','--confirm-migration-plan',sha,env={'PATH':str(shim)+':'+os.environ['PATH'],'REVIEW_INJECT_DST':str(p/'.sdlc/memory/z.md'),'REVIEW_PREFIX_DST':str(p/'.sdlc/memory/a.md')})
results['late-prefix']=detail(p,{'rc':rc,'output':o,'later_prefix_exists':(p/'.sdlc/memory/a.md').exists(),'current_data':(p/'.sdlc/memory/z.md').read_text()})
# Archive cp observes a later writer (or fails after a partial write).
shim=ROOT/'r2-cp-shim';shim.mkdir();write(shim/'cp','''#!/usr/bin/env python3
import os,sys,pathlib
dst=pathlib.Path(sys.argv[-1])
if str(dst)==os.environ.get('REVIEW_INJECT_DST'):
    dst.write_text('PARTIAL ARCHIVE\\n' if os.environ.get('REVIEW_CP_FAIL') else 'LATER ARCHIVE OWNER\\n')
    if os.environ.get('REVIEW_CP_FAIL'):sys.exit(1)
os.execv('/bin/cp',['/bin/cp']+sys.argv[1:])
''');(shim/'cp').chmod(0o755)
for fail in [False,True]:
    p=fixture('r2-archive-cp-'+str(fail));write(p/'.specify/memory/a.md','ORIGINAL A\n')
    dst=p/'.sdlc/legacy/.specify/memory/a.md'
    rc,o=run(p,'--adopt-governance-corpus','--plan');sha=re.search(r'^PLAN_SHA256=(.*)$',o,re.M)[1]
    e={'PATH':str(shim)+':'+os.environ['PATH'],'REVIEW_INJECT_DST':str(dst)}
    if fail:e['REVIEW_CP_FAIL']='yes'
    rc,o=run(p,'--adopt-governance-corpus','--apply','--confirm-migration-plan',sha,env=e)
    results['archive-cp-'+str(fail)]=detail(p,{'rc':rc,'output':o,'archive':dst.read_text() if dst.exists() else None,'temp_files':[f.name for f in (ROOT/(p.name+'-tmp')).iterdir()]})
# naked old-root and uppercase: independent corpus-side gate coverage.
for label,body in [('bare','Use .specify\n'),('uppercase','Read .SPECIFY/memory/a.md\n')]:
    p=fixture('r2-gate-'+label);write(p/'.specify/memory/a.md',body);results['gate-'+label]=apply(p)
write(ROOT/'r2-new-results.json',json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False,indent=2))
