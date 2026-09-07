exec(open('/tmp/d091-r1-review/probes.py').read().split('results={}')[0])
r={}
for label in ['empty','unsafe-empty','repeat']:
 p=fixture('r2-zero-'+label)
 if label=='unsafe-empty':(p/'.sdlc/memory').symlink_to(ROOT/'missing-external')
 if label=='repeat':write(p/'.specify/memory/a.md','Owner\n');r['first-adoption']=apply(p)
 for flag in ['--plan','--apply']:
  rc,o=run(p,'--adopt-governance-corpus',flag);r[label+flag]={'rc':rc,'output':o}
# Correct routed missing-template fixture preserves the independent L4 templates.
std=ROOT/'r2-standard-without-corpus';shutil.copytree(STD/'templates/business-domain-l4',std/'templates/business-domain-l4')
good=re.search("GOOD_MAP='(.*?)'",(STD/'tests/bootstrap-knowledge-target.test.sh').read_text(),re.S)[1]
for dry in [True,False]:
 p=fixture('r2-routed-missing-corpus-'+str(dry),False);write(p/'map.yaml',good)
 flags=['--domain-map',str(p/'map.yaml')]+(['--dry-run'] if dry else [])
 rc,o=run(p,*flags,env={'AI_SDLC_STANDARD_HOME':str(std)});r['routed-missing-'+str(dry)]={'rc':rc,'output':o}
write(ROOT/'r2-empty-results.json',json.dumps(r,ensure_ascii=False,indent=2));print(json.dumps(r,ensure_ascii=False,indent=2))
