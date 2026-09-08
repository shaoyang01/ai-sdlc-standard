import pathlib,subprocess,os,re,json,hashlib,time,shutil,tempfile
P=pathlib.Path
OUT=P('/tmp/d091-r5.9W7v7i');ROOT=P(tempfile.mkdtemp(prefix='cases-',dir=OUT))
STD=P('/Users/eric/meicai/projects/ai-sdlc-standard-governance-corpus-worktree');SCRIPT=STD/'scripts/bootstrap-knowledge-target.sh'
SHIM=ROOT/'bin';SHIM.mkdir(exist_ok=True)
def write(p,s):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s)
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def fixture(name,entry='adoption',folder='memory',second=False):
 p=ROOT/name;p.mkdir();subprocess.run(['git','init','-q',str(p)],check=True);subprocess.run(['git','-C',str(p),'config','user.name','Independent R5 Review'],check=True);write(p/'pom.xml','<project/>\n')
 if entry=='adoption':
  for f in ['00BusinessLandscape.md','00UbiquitousLanguage.md','01DomainCatalog.md']:write(p/'.sdlc/business_domain'/f,'# '+f+'\n')
 write(p/'.specify'/folder/'a.md','A .specify/memory/x\n')
 if second:write(p/'.specify'/folder/'z.md','Z .specify/coding_guide/y\n')
 return p
def call(p,flags,env=None):
 e=os.environ.copy();e.update(AI_SDLC_STANDARD_HOME=str(STD),TMPDIR=str(ROOT))
 if env:e.update(env)
 r=subprocess.run(['/bin/bash',str(SCRIPT),str(p)]+flags,env=e,capture_output=True,text=True,timeout=45)
 return r.returncode,r.stdout+r.stderr
def plan(p,entry):
 f=['--adopt-governance-corpus'] if entry=='adoption' else []
 rc,o=call(p,f+['--plan']);assert rc==0,o
 return f+['--apply','--confirm-migration-plan',re.search(r'^PLAN_SHA256=(.*)$',o,re.M)[1]]
write(SHIM/'partial.rb',r'''module ReviewPartialWrite
 def write(path,bytes,*args)
  if path.to_s==ENV['FAULT_DST']
   super(path,bytes.byteslice(0,7),*args) if ENV['FAULT_MODE']=='partial'
   raise IOError, 'independent injected destination write failure'
  end
  super
 end
end
File.singleton_class.prepend(ReviewPartialWrite)
''')
write(SHIM/'ruby',r'''#!/usr/bin/env python3
import os,sys,pathlib,subprocess
args=sys.argv[1:];p=pathlib.Path;mode=os.environ.get('FAULT_MODE','')
if '-e' in args:
 i=args.index('-e');code=args[i+1];argv=args[i+2:]
 if 'rules = [' in code and len(argv)==4 and argv[0]==argv[1]==os.environ.get('FAULT_DST'):
  dst=p(argv[1]);log=p(argv[3]);p(os.environ['TRIGGER']).write_text('triggered')
  if os.environ.get('TAKE_PREFIX'):p(os.environ['TAKE_PREFIX']).write_text('LATER PREFIX OWNER\n')
  if mode in ['log-eacces','log-eacces-owner']:log.chmod(0o444)
  if mode=='log-directory':args[-1]=str(log.parent)
  if mode=='crash':sys.exit(73)
  if mode in ['partial','no-write']:args=['-r',os.environ['PARTIAL_RB']]+args
  r=subprocess.run(['/usr/bin/ruby']+args,capture_output=True)
  stdout=r.stdout
  if mode in ['empty','empty-owner','empty-original']:stdout=b''
  if mode=='garble':stdout=b'GARBLED RECEIPT\n'
  if mode=='tail':stdout=stdout.rstrip(b'\n')+b' extra text\n'
  if mode=='tail-line':stdout=stdout+b'ADDITIONAL LINE\n'
  if mode=='bad-count':stdout=b'NaN\t'+stdout.split(b'\t')[-1]
  if mode=='bad-digest':stdout=b'1\t' + b'x'*64+b'\n'
  if mode in ['before-owner','log-eacces-owner','empty-owner']:dst.write_text('LATER TARGET OWNER\n')
  if mode=='before-link':dst.unlink();dst.symlink_to(os.environ['OWNER_FILE'])
  if mode=='before-delete':dst.unlink()
  if mode=='empty-original':dst.write_text(os.environ['ORIGINAL'])
  sys.stdout.buffer.write(stdout);sys.stderr.buffer.write(r.stderr);sys.exit(r.returncode)
os.execv('/usr/bin/ruby',['/usr/bin/ruby']+args)
''')
write(SHIM/'sleep',r'''#!/usr/bin/env python3
import os,sys,pathlib
if os.environ.get('HOOK_MARKER'):pathlib.Path(os.environ['HOOK_MARKER']).write_text('receipt registered before this sleep')
os.execv('/bin/sleep',['/bin/sleep']+sys.argv[1:])
''')
for f in [SHIM/'ruby',SHIM/'sleep']:f.chmod(0o755)
rows=[]
def collect(name,p,rc,o,orig,expected,kept=None,expect_conflict=False):
 js=list((p/'.sdlc/reports').glob('migration_report.*.json.*'));assert len(js)==1,(name,o)
 j=json.loads(js[0].read_text());md=next((p/'.sdlc/reports').glob('migration_report.*.md.*')).read_text()
 source_ok=all((p/rel).is_file() and digest(p/rel)==sha for rel,sha in orig.items())
 conflicts=j['rollback']['ownership_conflicts'];temps=list((p/'.sdlc/legacy').rglob('*.tmp.*'))
 row={'name':name,'rc':rc,'source_restored':source_ok,'status':j['status'],'conflicts':conflicts,'temps':[str(t.relative_to(p)) for t in temps],'output':o,'md':md,'report_path':str(js[0]),'expected_status':expected,'destination_objects':{str(f.relative_to(p)):os.readlink(f) if f.is_symlink() else f.read_text(errors='replace') for folder in ['memory','coding_guide'] for f in (p/'.sdlc'/folder).glob('*.md') if f.is_file() or f.is_symlink()}}
 checks=[rc==1,source_ok,j['status']==expected,not temps,bool(conflicts)==expect_conflict]
 if kept is not None:checks.append((p/kept).exists() or (p/kept).is_symlink())
 if expected=='FAILED_ROLLBACK_INCOMPLETE':checks.append('recovery not provably complete' in md)
 if not expect_conflict:checks.append(not row['destination_objects'])
 row['pass']=all(checks);rows.append(row);write(OUT/'probe-results.json',json.dumps(rows,ensure_ascii=False,indent=2));print(name,'PASS' if row['pass'] else 'FAIL',flush=True)
def execute(name,mode,entry='adoption',folder='memory',second=False,fault_leaf='a.md',expected='FAILED_ROLLED_BACK',conflict=False,take_prefix=False):
 p=fixture(name,entry,folder,second);src=p/'.specify'/folder/fault_leaf;dst=p/'.sdlc'/folder/fault_leaf
 if mode=='invalid-utf8':src.write_bytes(b'bad \xff\n')
 orig={str(f.relative_to(p)):digest(f) for f in (p/'.specify').rglob('*.md')};flags=plan(p,entry)
 owner=ROOT/'owners'/name;write(owner,'LATER LINK OWNER\n')
 env={'PATH':str(SHIM)+':'+os.environ['PATH'],'FAULT_MODE':mode,'FAULT_DST':str(dst),'TRIGGER':str(ROOT/(name+'.trigger')),'PARTIAL_RB':str(SHIM/'partial.rb'),'OWNER_FILE':str(owner),'ORIGINAL':src.read_text(errors='replace')}
 if take_prefix:env['TAKE_PREFIX']=str(p/'.sdlc'/folder/'a.md')
 if mode.startswith('before-'):
  # A later, genuine conversion failure starts rollback after the takeover.
  z=p/'.specify'/folder/'z.md';z.write_bytes(b'bad \xff\n');orig[str(z.relative_to(p))]=digest(z);flags=plan(p,entry)
 rc,o=call(p,flags,env)
 collect(name,p,rc,o,orig,expected,expect_conflict=conflict)
 # A true I/O failure reaches the transformer, with its original output bytes.
 if mode.startswith('log-'):assert 'corpus transform log append failed' in o,o
for entry in ['adoption','legacy']:
 for folder in ['memory','coding_guide']:
  for second in [False,True]:execute('-'.join(['b1',entry,folder,str(second)]),'log-eacces',entry,folder,second,'z.md' if second else 'a.md')
for mode in ['log-directory','crash','no-write','invalid-utf8','empty-original']:
 execute(mode,mode)
for mode in ['partial','garble','empty','tail','tail-line','bad-count','bad-digest','empty-owner']:
 execute(mode,mode,second=True,expected='FAILED_ROLLBACK_INCOMPLETE',conflict=True)
for mode in ['before-owner','before-link','before-delete','log-eacces-owner']:
 execute(mode,mode,second=True,conflict=True)
execute('mixed-known-and-unresolved','partial',second=True,fault_leaf='z.md',expected='FAILED_ROLLBACK_INCOMPLETE',conflict=True,take_prefix=True)
# Exact post-registration hook: sleep shim proves shell reached the wait AFTER append.
for kind in ['modify','link','delete']:
 name='registered-'+kind;p=fixture(name,second=True);(p/'.specify/memory/z.md').write_bytes(b'bad \xff\n');orig={str(f.relative_to(p)):digest(f) for f in (p/'.specify').rglob('*.md')};flags=plan(p,'adoption');pause=ROOT/(name+'.pause');marker=ROOT/(name+'.marker');write(pause,'pause')
 env=os.environ.copy();env.update(AI_SDLC_STANDARD_HOME=str(STD),TMPDIR=str(ROOT),PATH=str(SHIM)+':'+env['PATH'],KT_TEST_TRANSFORM_PAUSE_FILE=str(pause),HOOK_MARKER=str(marker))
 proc=subprocess.Popen(['/bin/bash',str(SCRIPT),str(p)]+flags,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 try:
  end=time.monotonic()+20
  while not marker.exists():
   assert proc.poll() is None and time.monotonic()<end,'hook not reached'
   time.sleep(.02)
  dst=p/'.sdlc/memory/a.md'
  if kind=='modify':dst.write_text('REGISTERED LATER OWNER\n')
  else:
   dst.unlink()
   if kind=='link':owner=ROOT/'owners'/name;write(owner,'REGISTERED LINK OWNER\n');dst.symlink_to(owner)
 finally:pause.unlink(missing_ok=True)
 out,err=proc.communicate(timeout=30);collect(name,p,proc.returncode,out+err,orig,'FAILED_ROLLED_BACK',expect_conflict=True)
print('TOTAL',len(rows),'PASS',sum(r['pass'] for r in rows),flush=True)
