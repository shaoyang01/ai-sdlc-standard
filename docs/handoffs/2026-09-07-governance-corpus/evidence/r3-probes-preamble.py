import os, pathlib, subprocess, json, hashlib, shutil, re
P=pathlib.Path
ROOT=P(os.environ.get('D091_REVIEW_ROOT','/tmp/d091-r1-review'))
ROOT.mkdir(parents=True,exist_ok=True)
STD=P('/Users/eric_shaoooo/meicai/projects/ai-sdlc-standard-governance-corpus-worktree')
SCRIPT=STD/'scripts/bootstrap-knowledge-target.sh'
def write(p,s):
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(s)
def fixture(name,complete=True):
    p=ROOT/name;p.mkdir()
    subprocess.run(['git','init','-q',str(p)],check=True)
    subprocess.run(['git','-C',str(p),'config','user.name','Review Runner'],check=True)
    write(p/'pom.xml','<project/>\n')
    (p/'.sdlc').mkdir()
    if complete:
        for f in ['00BusinessLandscape.md','00UbiquitousLanguage.md','01DomainCatalog.md']:
            write(p/'.sdlc/business_domain'/f,'# '+f+'\n')
    return p
def run(p,*args,env=None):
    e=os.environ.copy();e['AI_SDLC_STANDARD_HOME']=str(STD)
    tmp=ROOT/(p.name+'-tmp');tmp.mkdir(exist_ok=True);e['TMPDIR']=str(tmp)
    if env:e.update(env)
    r=subprocess.run(['bash',str(SCRIPT),str(p),*args],capture_output=True,text=True,env=e)
    idx=len(list(ROOT.glob(p.name+'-*.log')))
    write(ROOT/(p.name+'-'+str(idx)+'.log'),r.stdout+r.stderr)
    return r.returncode,r.stdout+r.stderr
def apply(p):
    rc,out=run(p,'--adopt-governance-corpus','--plan')
    sha=re.search(r'^PLAN_SHA256=(.*)$',out,re.M)
    if not sha:return {'plan_rc':rc,'apply_rc':None,'error':out[-500:]}
    ar,ao=run(p,'--adopt-governance-corpus','--apply','--confirm-migration-plan',sha[1])
    return {'plan_rc':rc,'apply_rc':ar,'plan':out,'output_tail':ao[-600:]}
def reports(p):
    return [json.loads(x.read_text()) for x in (p/'.sdlc/reports').glob('migration_report.*.json.*')]
results={}
p=fixture('anti-init',False);write(p/'.specify/memory/constitution.md','original owner corpus\n')
rc,o=run(p,'--dry-run');ar,ao=run(p)
results['anti-init']={'dry_rc':rc,'dry_claims_create':'create   memory/constitution.md' in o,'dry_claims_skip':'skeleton not generated' in o,'apply_rc':ar,'partial_sdlc_files':len(list((p/'.sdlc').rglob('*'))),'source':(p/'.specify/memory/constitution.md').read_text(),'error':ao[-400:]}
p=fixture('missing-template',False);old=ROOT/'old-standard';old.mkdir()
rc,o=run(p,env={'AI_SDLC_STANDARD_HOME':str(old)})
results['missing-template']={'rc':rc,'files':len(list((p/'.sdlc').rglob('*'))),'output_tail':o[-500:]}
p=fixture('archive-overwrite');write(p/'.specify/memory/extra.md','See .specify/memory/item\n');write(p/'.sdlc/memory/extra.md','See .sdlc/memory/item\n');write(p/'.sdlc/legacy/.specify/memory/extra.md','HISTORICAL OWNER DATA\n')
results['archive-overwrite']=apply(p);results['archive-overwrite']['archive_after']=(p/'.sdlc/legacy/.specify/memory/extra.md').read_text()
p=fixture('ancestor-escape');outside=ROOT/'ancestor-outside';write(outside/'memory/extra.md','External .specify/memory/item\n');os.symlink(outside,p/'.specify')
results['ancestor-escape']=apply(p);results['ancestor-escape']['outside_source_exists']=(outside/'memory/extra.md').exists();results['ancestor-escape']['adopted_exists']=(p/'.sdlc/memory/extra.md').exists()
p=fixture('internal-link');write(p/'business.md','Business .specify/memory/item\n');(p/'.specify/memory').mkdir(parents=True);os.symlink('../../business.md',p/'.specify/memory/extra.md')
results['internal-link']=apply(p);results['internal-link']['business_after']=(p/'business.md').read_text()
p=fixture('gate-prefix');write(p/'.specify/memory/extra.md','clean corpus\n');write(p/'.sdlc/business_domain/extra.md','Follow custom-legacy/.specify/workflow/active.md\n')
results['gate-prefix']=apply(p)
p=fixture('archive-remap');write(p/'.specify/memory/extra.md','Archived .sdlc/legacy/.specify/memory/item.md\nspecs/start.md\n （specs/fullwidth.md） `specs/backtick.md` (specs/ascii.md) specs/space.md\nSpecify -> Clarify -> Plan -> Tasks -> Analyze -> Implement -> Sync\n| Role | Responsibility |\n| Implement | Sync |\n')
results['archive-remap']=apply(p);results['archive-remap']['after']=(p/'.sdlc/memory/extra.md').read_text();results['archive-remap']['reports']=reports(p);results['archive-remap']['raw_archive_exists']=(p/'.sdlc/legacy/.specify/memory/extra.md').exists()
write(ROOT/'results.json',json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False,indent=2))
