exec(open('/tmp/d091-r1-review/probes.py').read().split('results={}')[0])
import time
results={}
def state(p):
 return {'sources':{str(f.relative_to(p)):f.read_bytes().hex() for f in (p/'.specify').rglob('*') if f.is_file()},'reports':reports(p),'archive_temps':[str(f.relative_to(p)) for f in (p/'.sdlc/legacy').rglob('*.tmp.*')]}
def paused_apply(p, mutate):
 rc,o=run(p,'--adopt-governance-corpus','--plan');sha=re.search(r'^PLAN_SHA256=(.*)$',o,re.M)[1]
 pause=ROOT/(p.name+'.pause');write(pause,'pause')
 tmp=ROOT/(p.name+'-tmp');tmp.mkdir(exist_ok=True)
 env=os.environ.copy();env.update(AI_SDLC_STANDARD_HOME=str(STD),TMPDIR=str(tmp),KT_TEST_PAUSE_FILE=str(pause))
 proc=subprocess.Popen(['/bin/bash',str(SCRIPT),str(p),'--adopt-governance-corpus','--apply','--confirm-migration-plan',sha],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
 try:
  deadline=time.time()+20
  while not (p/'.sdlc/memory/a.md').exists():
   if proc.poll() is not None or time.time()>deadline:raise RuntimeError('pause not reached')
   time.sleep(.02)
  mutate(p,proc.pid)
 finally:pause.unlink(missing_ok=True)
 out,err=proc.communicate(timeout=40);write(ROOT/(p.name+'-apply.log'),out+err)
 return {'plan_rc':rc,'rc':proc.returncode,'output':out+err,**state(p)}
# Collision / RETIRE branch must also check archive path components.
p=fixture('r3-retire-escape');outside=ROOT/'r3-retire-outside';outside.mkdir();(p/'.sdlc/legacy').symlink_to(outside)
write(p/'.specify/memory/a.md','Use .specify/memory/x\n');write(p/'.sdlc/memory/a.md','Use .sdlc/memory/x\n')
r=apply(p);r['outside']={str(f.relative_to(outside)):f.read_text() for f in outside.rglob('*') if f.is_file()};results['retire-escape']=r
# .sdlc itself is omitted by the new helper, when destination corpus roots don't exist.
p=fixture('r3-sdlc-root');outside=ROOT/'r3-sdlc-outside';shutil.move(str(p/'.sdlc'),outside);(p/'.sdlc').symlink_to(outside)
rc,o=run(p,'--audit');results['sdlc-root']={'rc':rc,'corpus_outside':len(list((outside/'memory').glob('*.md'))),'output':o}
# Archive appears after internal planning but before the staging branch.
p=fixture('r3-late-before-stage');write(p/'.specify/memory/a.md','ORIGINAL A\n')
results['late-before-stage']=paused_apply(p,lambda p,pid:write(p/'.sdlc/legacy/.specify/memory/a.md','LATER ARCHIVE OWNER\n'))
results['late-before-stage']['archive']=(p/'.sdlc/legacy/.specify/memory/a.md').read_text()
# Predictable temp path is not exclusively created and bypasses leaf safety.
for symlink in [False,True]:
 p=fixture('r3-temp-owner-'+str(symlink));write(p/'.specify/memory/a.md','ORIGINAL A\n');outside=ROOT/('r3-temp-owner-outside-'+str(symlink));write(outside,'EXTERNAL OWNER\n')
 paths=[]
 def mutate(p,pid):
  temp=p/('.sdlc/legacy/.specify/memory/a.md.tmp.'+str(pid));temp.parent.mkdir(parents=True,exist_ok=True);paths.append(temp)
  if symlink:temp.symlink_to(outside)
  else:write(temp,'PREEXISTING TEMP OWNER\n')
 r=paused_apply(p,mutate);r['outside']=outside.read_text();r['temp_preserved']=paths[0].exists();r['archive_is_symlink']=(p/'.sdlc/legacy/.specify/memory/a.md').is_symlink();results['temp-owner-'+str(symlink)]=r
# New publication: inject at exact cp staging or mv publication boundary.
shim=ROOT/'r3-archive-shim';shim.mkdir()
write(shim/'cp','''#!/usr/bin/env python3
import os,sys,pathlib
dst=pathlib.Path(sys.argv[-1]);mode=os.environ.get('R3_CASE')
if '.sdlc/legacy/.specify/memory/' in str(dst) and '.tmp.' in dst.name:
 if mode=='partial':dst.write_text('PARTIAL\\n');sys.exit(1)
 if mode=='late-after-stage':
  r=__import__('subprocess').run(['/bin/cp']+sys.argv[1:]);pathlib.Path(str(dst).rsplit('.tmp.',1)[0]).write_text('LATER ARCHIVE OWNER\\n');sys.exit(r.returncode)
 if mode=='prefix-archive' and dst.name.startswith('z.md.tmp.'):
  (dst.parent/'a.md').write_text('LATER PREFIX ARCHIVE OWNER\\n');dst.write_text('PARTIAL\\n');sys.exit(1)
os.execv('/bin/cp',['/bin/cp']+sys.argv[1:])
''')
write(shim/'mv','''#!/usr/bin/env python3
import os,sys,pathlib
src=pathlib.Path(sys.argv[-2]);dst=pathlib.Path(sys.argv[-1]);mode=os.environ.get('R3_CASE')
if '.tmp.' in src.name and '.sdlc/legacy/.specify/memory/' in str(dst):
 if mode=='directory':dst.mkdir();(dst/'owner.txt').write_text('DIRECTORY OWNER\\n')
 if mode=='late-at-mv':dst.write_text('LATER ARCHIVE OWNER\\n')
os.execv('/bin/mv',['/bin/mv']+sys.argv[1:])
''')
for f in shim.iterdir():f.chmod(0o755)
for mode in ['partial','late-after-stage','late-at-mv','prefix-archive','directory']:
 p=fixture('r3-archive-'+mode);write(p/'.specify/memory/a.md','SOURCE .specify/memory/x\n')
 if mode=='prefix-archive':write(p/'.specify/memory/z.md','SOURCE Z\n')
 rc,o=run(p,'--adopt-governance-corpus','--plan');sha=re.search(r'^PLAN_SHA256=(.*)$',o,re.M)[1]
 rc,o=run(p,'--adopt-governance-corpus','--apply','--confirm-migration-plan',sha,env={'PATH':str(shim)+':'+os.environ['PATH'],'R3_CASE':mode})
 results['archive-'+mode]={'rc':rc,'output':o,**state(p),'archive_files':{str(f.relative_to(p)):f.read_text() for f in (p/'.sdlc/legacy').rglob('*') if f.is_file()}}
# A writer AFTER transformation finishes but BEFORE digest sampling is not the accepted pre-transform residual.
shim=ROOT/'r3-ruby-shim';shim.mkdir();write(shim/'ruby','''#!/usr/bin/env python3
import os,sys,pathlib,subprocess
args=sys.argv[1:]
if len(args)>3 and args[0]=='-e' and 'rules = [' in args[1] and args[3]==os.environ.get('R3_TRANSFORM_DST'):
 r=subprocess.run(['/usr/bin/ruby']+args)
 if r.returncode==0:pathlib.Path(args[3]).write_text('LATER POST-TRANSFORM OWNER\\n')
 sys.exit(r.returncode)
os.execv('/usr/bin/ruby',['/usr/bin/ruby']+args)
''');(shim/'ruby').chmod(0o755)
p=fixture('r3-post-transform-owner');write(p/'.specify/memory/a.md','Use .specify/memory/x\n');(p/'.specify/memory/z.md').write_bytes(b'bad \xff\n')
rc,o=run(p,'--adopt-governance-corpus','--plan');sha=re.search(r'^PLAN_SHA256=(.*)$',o,re.M)[1]
rc,o=run(p,'--adopt-governance-corpus','--apply','--confirm-migration-plan',sha,env={'PATH':str(shim)+':'+os.environ['PATH'],'R3_TRANSFORM_DST':str(p/'.sdlc/memory/a.md')})
results['post-transform-owner']={'rc':rc,'output':o,'owner_exists':(p/'.sdlc/memory/a.md').exists(),**state(p)}
write(ROOT/'r3-new-results.json',json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False,indent=2))
