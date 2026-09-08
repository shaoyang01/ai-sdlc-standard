#!/usr/bin/env python3
"""D091-R4 B1: real transformer log I/O failure after successful destination write."""
import hashlib,json,os,pathlib,re,subprocess,tempfile
P=pathlib.Path
STD=P('/Users/eric/meicai/projects/ai-sdlc-standard-governance-corpus-worktree')
ROOT=P(tempfile.mkdtemp(prefix='d091-r4-b1-',dir='/tmp'))
rows=[]
for entry in ['adoption','legacy']:
 for folder in ['memory','coding_guide']:
  repo=ROOT/(entry+'-'+folder);repo.mkdir();subprocess.run(['git','init','-q',str(repo)],check=True);subprocess.run(['git','-C',str(repo),'config','user.name','Independent Review'],check=True)
  (repo/'pom.xml').write_text('<project/>\n')
  if entry=='adoption':
   bd=repo/'.sdlc/business_domain';bd.mkdir(parents=True)
   for f in ['00BusinessLandscape.md','00UbiquitousLanguage.md','01DomainCatalog.md']:(bd/f).write_text('# '+f+'\n')
  src=repo/'.specify'/folder/'a.md';src.parent.mkdir(parents=True);src.write_text('Use .specify/memory/x\n')
  z=src.parent/'z.md';z.write_text('SECOND ORIGINAL\n')
  dst=repo/'.sdlc'/folder/'a.md';shim=repo/'shim';shim.mkdir()
  ruby=shim/'ruby';ruby.write_text('''#!/usr/bin/env python3
import os,pathlib,sys
args=sys.argv[1:]
if '-e' in args:
 i=args.index('-e');code=args[i+1];argv=args[i+2:]
 if 'rules = [' in code and len(argv)==4 and argv[0]==argv[1]==os.environ['B1_DST']:
  pathlib.Path(argv[3]).chmod(0o444)
  print('PROBE: log append permission denied; destination never changed by probe',file=sys.stderr)
os.execv('/usr/bin/ruby',['/usr/bin/ruby']+args)
''');ruby.chmod(0o755)
  env=os.environ.copy();env.update(AI_SDLC_STANDARD_HOME=str(STD),TMPDIR=str(ROOT))
  flags=['--adopt-governance-corpus'] if entry=='adoption' else []
  cmd=['/bin/bash',str(STD/'scripts/bootstrap-knowledge-target.sh'),str(repo)]+flags
  plan=subprocess.run(cmd+['--plan'],capture_output=True,text=True,env=env);assert plan.returncode==0,plan.stderr
  sha=re.search(r'^PLAN_SHA256=(.*)$',plan.stdout,re.M)[1]
  env.update(PATH=str(shim)+':'+env['PATH'],B1_DST=str(dst))
  result=subprocess.run(cmd+['--apply','--confirm-migration-plan',sha],capture_output=True,text=True,env=env)
  (repo/'probe-output.log').write_text(result.stdout+result.stderr)
  report=json.loads(next((repo/'.sdlc/reports').glob('migration_report.*.json.*')).read_text())
  row={'entry':entry,'folder':folder,'target':str(repo),'exit':result.returncode,'source_restored':src.read_text()=='Use .specify/memory/x\n','second_source_restored':z.read_text()=='SECOND ORIGINAL\n','self_written_dst_remaining':dst.read_text() if dst.exists() else None,'status':report['status'],'conflicts':report['rollback']['ownership_conflicts'],'temp_archives':[str(x) for x in (repo/'.sdlc/legacy').rglob('*.tmp.*')]}
  assert row['exit']==1 and row['source_restored'] and row['second_source_restored']
  assert row['self_written_dst_remaining'] is None, row
  assert row['status']=='FAILED_ROLLED_BACK' and row['conflicts']==[], row
  assert row['temp_archives']==[], row
  rows.append(row)
(ROOT/'results-fixed.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2));print(json.dumps({'evidence_root':str(ROOT),'reproductions':rows},ensure_ascii=False,indent=2))
