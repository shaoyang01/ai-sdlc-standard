from pathlib import Path
import subprocess,json,time
root=Path('/private/tmp/g4-r8-mutations');ev=Path('/private/tmp/g4-r8-evidence')
cases=[
('M-A-status-default','core/node-output-envelope.ts','if (!hasDecisionStatusField || typeof rawDecisionStatus !== "string") {','if (!hasDecisionStatusField) rawDecisionStatus = "CONFIRMED";\n    if (typeof rawDecisionStatus !== "string") {','tests/node-output-envelope.test.ts'),

('M-C-blocked-retry','core/loop-capability-execution.ts','} else if (blockedRetryOk) {','} else if (false && blockedRetryOk) {','tests/loop-g4-r6-fix-round.test.ts'),

('M-E-accept-version','core/loop-run-store.ts','          event.schemaVersion === LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION &&\n','','tests/loop-g4-r6-fix-round.test.ts'),
('M-F-ledger-order','core/loop-regate.ts','    facts.lastVerdict.sequence > facts.lastScan!.sequence &&\n','','tests/loop-g4-r6-fix-round.test.ts'),
]
res=[]
for label,file,old,new,test in cases:
 p=root/file;data=p.read_text();assert data.count(old)==1,(label,data.count(old));p.write_text(data.replace(old,new))
 try:
  r=subprocess.run(['node','--import','tsx',test],cwd=root,text=True,capture_output=True,timeout=120)
  (ev/(label+'.log')).write_text(r.stdout+r.stderr)
  item={'mutation':label,'exit':r.returncode,'killed':r.returncode!=0,'test':test};res.append(item);print(json.dumps(item),flush=True)
 finally:p.write_text(data)
(ev/'mutations.json').write_text(json.dumps(res,indent=2))
print(subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True))
