exec(open('/tmp/d091-r1-review/probes.py').read().split('results={}')[0])
import socket
results={};matrix=[]
def snap(p):
    out={}
    for f in p.rglob('*'):
        if '.git' in f.parts:continue
        if f.is_symlink():out[str(f.relative_to(p))]=['link',os.readlink(f)]
        elif f.is_file():out[str(f.relative_to(p))]=hashlib.sha256(f.read_bytes()).hexdigest()
    return out
good=re.search("GOOD_MAP='(.*?)'",(STD/'tests/bootstrap-knowledge-target.test.sh').read_text(),re.S)[1]
for mode in ['init','audit','routed']:
 for kind in ['source','dangling-source','missing-template','unsafe-root']:
  for dry in [True,False]:
   name='r2-matrix-'+mode+'-'+kind+'-'+str(dry);p=fixture(name,mode=='audit');env={};flags=[]
   if mode=='audit':flags+=['--audit']
   if mode=='routed':write(p/'map.yaml',good);flags+=['--domain-map',str(p/'map.yaml')]
   if kind=='source':write(p/'.specify/memory/constitution.md','OWNER SOURCE\n')
   if kind=='dangling-source':
    (p/'.specify/memory').mkdir(parents=True);(p/'.specify/memory/constitution.md').symlink_to(p/'missing.md')
   if kind=='missing-template':env['AI_SDLC_STANDARD_HOME']=str(ROOT/'old-standard')
   if kind=='unsafe-root':
    outside=ROOT/(name+'-outside');outside.mkdir();(p/'.sdlc/memory').symlink_to(outside)
   if dry:flags+=['--dry-run']
   before=snap(p);rc,o=run(p,*flags,env=env);after=snap(p)
   reports_text='\n'.join(x.read_text() for x in (p/'.sdlc/reports').glob('*') if x.is_file())
   matrix.append({'mode':mode,'kind':kind,'dry':dry,'rc':rc,'zero_write':before==after,'created_skipped':(p/'.sdlc/memory/constitution.md').exists(),'stdout_notice':('CORPUS SKIP' in o or 'corpus ' in o),'report_notice':('corpus ' in reports_text or 'CORPUS SKIP' in reports_text)})
results['skip-matrix']=matrix
# Mixed LEGACY C2+C7+C11/C12 transaction and raw archives.
p=fixture('r2-legacy-overlap',False);shutil.rmtree(p/'.sdlc')
sources={'.specify/project-governance-profile.yaml':'project: {name: Review}\n','.specify/reports/old.md':'OLD REPORT\n','.specify/memory/a.md':'Use .specify/memory/x\n','.specify/coding_guide/b.md':'Use .specify/coding_guide/y\n'}
for rel,s in sources.items():write(p/rel,s)
r=apply(p);r['archive_bytes_all_match']=all((p/'.sdlc/legacy'/rel).read_text()==s for rel,s in sources.items());r['rules']=[x['rule'] for x in reports(p)[0]['files']];results['legacy-overlap']=r
# Identical transformed destination: absent/same/different/dangling original archive.
for state in ['absent','same','different','dangling']:
 p=fixture('r2-identical-'+state);src=p/'.specify/memory/a.md';arch=p/'.sdlc/legacy/.specify/memory/a.md';write(src,'Use .specify/memory/x\n');write(p/'.sdlc/memory/a.md','Use .sdlc/memory/x\n')
 if state in ['same','different']:write(arch,src.read_text() if state=='same' else 'HISTORY\n')
 if state=='dangling':arch.parent.mkdir(parents=True);arch.symlink_to(p/'missing')
 r=apply(p);r['source_exists']=src.exists();rc,o=run(p,'--adopt-governance-corpus','--plan');r['replan_rc']=rc;r['replan']=o;results['identical-'+state]=r
# Real source archive exact bytes and report mapping count, seven precise pending increments.
p=ROOT/'real-corpus-copy';rep=reports(p)[0];orig=P('/Users/eric_shaoooo/meicai/projects/logistics-center/.specify')
results['real-archive']={'bindings':sum('original_archive' in f for f in rep['files']),'raw_count':sum(1 for f in (p/'.sdlc/legacy/.specify').rglob('*') if f.is_file()),'exact_raw':all((p/'.sdlc/legacy/.specify'/f.relative_to(orig)).read_bytes()==f.read_bytes() for d in ['memory','coding_guide'] for f in (orig/d).rglob('*') if f.is_file()),'pending':len(rep['pending_confirmation'])}
oldrep=json.loads((P('/tmp/d091-r1-review')/'coverage-results.json').read_text())['real-copy']['pending'];keys=lambda ps:{(x['file'],x['line']) for x in ps}
results['real-archive']['pending_added']=sorted(keys(rep['pending_confirmation'])-keys(oldrep))
# Transform(transformed input) is byte-identical: feed the actual converted bytes as a NEW source.
p=fixture('r2-transform-twice');src=(ROOT/'coverage-nine/.sdlc/memory/中文.md').read_bytes();(p/'.specify/memory').mkdir(parents=True);(p/'.specify/memory/中文.md').write_bytes(src);r=apply(p);results['transform-twice']={'rc':r['apply_rc'],'identical':(p/'.sdlc/memory/中文.md').read_bytes()==src}
# Partial find enumeration is blocked (unreadable nested dir), unlike omitted special types.
p=fixture('r2-find-partial');write(p/'.specify/memory/a.md','Good\n');write(p/'.specify/memory/private/b.md','Hidden\n');(p/'.specify/memory/private').chmod(0)
try:rc,o=run(p,'--adopt-governance-corpus','--plan');results['find-partial']={'rc':rc,'output':o}
finally:(p/'.specify/memory/private').chmod(0o755)
p=fixture('r2-socket');(p/'.specify/memory').mkdir(parents=True);s=socket.socket(socket.AF_UNIX);s.bind(str(p/'.specify/memory/sock'))
try:rc,o=run(p,'--adopt-governance-corpus','--plan');results['socket']={'rc':rc,'output':o}
finally:s.close()
# Non-directory corpus root is omitted too.
p=fixture('r2-source-file-root');write(p/'.specify/memory','OWNER REGULAR ROOT\n');rc,o=run(p,'--adopt-governance-corpus','--plan');results['source-file-root']={'rc':rc,'output':o}
write(ROOT/'r2-matrix-results.json',json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False,indent=2))
