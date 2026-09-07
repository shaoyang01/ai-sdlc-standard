exec(open('/tmp/d091-r1-review/probes.py').read().split('results={}')[0])
import socket,stat
results={};rows=[]
def fingerprint(p):
 out={}
 for f in p.rglob('*'):
  if '.git' in f.parts:continue
  s=f.lstat()
  if stat.S_ISDIR(s.st_mode):continue
  out[str(f.relative_to(p))]=(stat.S_IFMT(s.st_mode),os.readlink(f) if f.is_symlink() else hashlib.sha256(f.read_bytes()).hexdigest() if stat.S_ISREG(s.st_mode) else 'special')
 return out
for mode in ['adoption','legacy']:
 for kind in ['symlink','dangling','fifo','socket']:
  for mix in [False,True]:
   p=fixture('r3-types-'+mode+'-'+kind+'-'+str(mix),mode=='adoption')
   if mode=='legacy':shutil.rmtree(p/'.sdlc')
   root=p/'.specify/memory';root.mkdir(parents=True);leaf=root/'unsafe';s=None
   if kind=='symlink':write(p/'business.md','BUSINESS\n');leaf.symlink_to(p/'business.md')
   if kind=='dangling':leaf.symlink_to(p/'missing')
   if kind=='fifo':os.mkfifo(leaf)
   if kind=='socket':s=socket.socket(socket.AF_UNIX);s.bind(str(leaf))
   if mix:write(root/'ok.md','Owner\n')
   before=fingerprint(p)
   for flag in ['--plan','--apply']:
    rc,o=run(p,*(['--adopt-governance-corpus'] if mode=='adoption' else []),flag)
    rows.append({'mode':mode,'kind':kind,'mixed':mix,'flag':flag,'rc':rc,'c10':('C10' in o or 'regular file' in o or 'symlink' in o),'unchanged':before==fingerprint(p)})
   if s:s.close()
results['nonregular']=rows
# LEGACY non-corpus special nodes stay outside the expanded enumeration.
p=fixture('r3-noncorpus-special',False);shutil.rmtree(p/'.sdlc');(p/'.specify/templates').mkdir(parents=True);os.mkfifo(p/'.specify/templates/pipe');write(p/'.specify/memory/a.md','Owner\n')
rc,o=run(p,'--plan');results['noncorpus-special']={'rc':rc,'pipe_not_classified':'templates/pipe' not in o}
# Empty roots / excluded-only roots: both syntax and semantic output are required.
rows=[]
for kind in ['absent','excluded-only','empty-directories']:
 for unsafe in [False,True]:
  p=fixture('r3-empty-matrix-'+kind+'-'+str(unsafe))
  if kind=='excluded-only':write(p/'.specify/project-context/owner.md','OWNER EXCLUDED\n')
  if kind=='empty-directories':(p/'.specify/memory').mkdir(parents=True);(p/'.specify/coding_guide').mkdir()
  if unsafe:(p/'.sdlc/memory').symlink_to(ROOT/'missing-outside')
  for flag in ['--plan','--dry-run','--apply','--apply']:
   rc,o=run(p,'--adopt-governance-corpus',flag)
   rows.append({'kind':kind,'unsafe':unsafe,'flag':flag,'rc':rc,'unbound':'unbound' in o,'semantic_output':('PLAN_SHA256=' in o if flag in ['--plan','--dry-run'] else 'MIGRATION REPORT=' in o) if not unsafe else 'corpus-destination' in o})
results['empty']=rows
# Post-move later-writer/destination-deletion behavior for ordinary C1, C7 and transformed corpus.
shim=ROOT/'r3-generic-shim';shim.mkdir();write(shim/'mv','''#!/usr/bin/env python3
import os,sys,pathlib
dst=pathlib.Path(sys.argv[-1]);prefix=pathlib.Path(os.environ['R3_PREFIX'])
if str(dst)==os.environ.get('R3_CURRENT'):
 if os.environ.get('R3_DELETE'):prefix.unlink()
 else:prefix.write_text('LATER OWNER\\n')
 dst.write_text('CURRENT OWNER\\n')
os.execv('/bin/mv',['/bin/mv']+sys.argv[1:])
''');(shim/'mv').chmod(0o755)
rows=[]
for folder,target in [('business_domain','.sdlc/business_domain'),('reports','.sdlc/legacy/.specify/reports'),('memory','.sdlc/memory')]:
 for delete in [False,True]:
  p=fixture('r3-ownership-'+folder+'-'+str(delete),False);shutil.rmtree(p/'.sdlc')
  write(p/('.specify/'+folder+'/a.md'),'OWNER A\n');write(p/('.specify/'+folder+'/z.md'),'OWNER Z\n')
  rc,o=run(p,'--plan');sha=re.search(r'^PLAN_SHA256=(.*)$',o,re.M)[1]
  env={'PATH':str(shim)+':'+os.environ['PATH'],'R3_PREFIX':str(p/target/'a.md'),'R3_CURRENT':str(p/target/'z.md')}
  if delete:env['R3_DELETE']='yes'
  rc,o=run(p,'--apply','--confirm-migration-plan',sha,env=env)
  rows.append({'folder':folder,'delete':delete,'rc':rc,'source_restored':(p/('.specify/'+folder+'/a.md')).read_text()=='OWNER A\n','prefix_preserved':not(p/target/'a.md').exists() if delete else (p/target/'a.md').read_text()=='LATER OWNER\n','current_preserved':(p/target/'z.md').read_text()=='CURRENT OWNER\n','conflicts':reports(p)[0]['rollback']['ownership_conflicts']})
results['ordinary-ownership']=rows
write(ROOT/'r3-boundary-matrix-results.json',json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False,indent=2))
