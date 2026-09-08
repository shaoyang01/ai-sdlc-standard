import pathlib,os,subprocess,select,hashlib,json,re
P=pathlib.Path;r=P('/tmp/d091-r5.9W7v7i/stream');r.mkdir()
s=P('/Users/eric/meicai/projects/ai-sdlc-standard-governance-corpus-worktree/scripts/bootstrap-knowledge-target.sh').read_text()
fn=s[s.index('corpus_transform_file() {'):s.index('# pending-confirmation scan')];script=r/'transform.sh';script.write_text('#!/bin/bash\n'+fn+'\ncorpus_transform_file "$@"\n')
src=r/'source';dst=r/'destination';pipe=r/'log.pipe';src.write_text('中文 .specify/memory/x\n specs/a\n$speckit-sync\n');os.mkfifo(pipe)
p=subprocess.Popen(['/bin/bash',str(script),str(src),str(dst),'receipt-test',str(pipe)],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
try:
 ready,_,_=select.select([p.stdout],[],[],5);assert ready,'receipt was not flushed before log FIFO open'
 receipt=p.stdout.readline().decode();before_exit=p.poll();assert before_exit is None,'expected log FIFO open to block'
 fd=os.open(pipe,os.O_RDONLY|os.O_NONBLOCK)
 rest,err=p.communicate(timeout=5);log=os.read(fd,65536);os.close(fd)
 total,dig=receipt.strip().split('\t')
 result={'receipt_before_log_reader':True,'process_waiting_at_log':before_exit is None,'exit':p.returncode,'stdout_rest':rest.decode(),'stderr':err.decode(),'digest_matches':hashlib.sha256(dst.read_bytes()).hexdigest()==dig,'total':int(total),'tsv_total':sum(int(x.split('\t')[2]) for x in log.decode().splitlines()),'log':log.decode()}
 assert result['exit']==0 and result['digest_matches'] and result['total']==result['tsv_total'] and not rest
finally:
 if p.poll() is None:p.kill();p.wait()
# Execute the exact source snippets at all three rollback state calculation sites.
pattern=r'mig_rb="INCOMPLETE"; \[\[ "\$\{MIG_ROLLBACK_OK\}" == "true" \]\] && mig_rb="ROLLED_BACK"\n(?:\s*#.*\n)*\s*\[\[ "\$\{MIG_UNRESOLVED_RESIDUE:-false\}" == "true" \]\] && mig_rb="INCOMPLETE"'
parts=re.findall(pattern,s);assert len(parts)==3,len(parts);matrix=[]
for i,part in enumerate(parts):
 for ok in ['true','false']:
  for residue in ['unset','false','true']:
   code='set -eu\nMIG_ROLLBACK_OK='+ok+'\n'+('unset MIG_UNRESOLVED_RESIDUE\n' if residue=='unset' else 'MIG_UNRESOLVED_RESIDUE='+residue+'\n')+part+'\nprintf "%s" "$mig_rb"\n'
   q=subprocess.run(['/bin/bash','-c',code],capture_output=True,text=True);expected='ROLLED_BACK' if ok=='true' and residue!='true' else 'INCOMPLETE';assert q.returncode==0 and q.stdout==expected,(i,ok,residue,q.stdout,q.stderr)
   matrix.append({'site':i,'rollback_ok':ok,'residue':residue,'result':q.stdout})
result['state_matrix']=matrix;(r/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
