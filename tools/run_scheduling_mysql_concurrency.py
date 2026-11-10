from pathlib import Path
import subprocess,os,datetime,secrets,time,json
root=Path(__file__).resolve().parents[1]
db='vhs_sched_test_'+datetime.datetime.now().strftime('%Y%m%d')+'_'+secrets.token_hex(4)
env=os.environ.copy();env.update(VHS_SCHEDULING_TEST_DB=db,MAIL_MAILER='array',CACHE_STORE='array',GEMINI_API_KEY='fictional-test-key',GROQ_API_KEY='fictional-test-key')
script=str(root/'tools/test_scheduling_mysql_concurrency.php')
def call(*args):
 r=subprocess.run(['php',script,*args],cwd=root,env=env,capture_output=True,text=True,timeout=50)
 if r.returncode: raise RuntimeError('Isolated MySQL test failed; no clinic records changed. '+r.stderr[:600])
 return json.loads(r.stdout)
setup=call('setup')
processes=[subprocess.Popen(['php',script,'worker',str(i)],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for i in (1,2)]
folder=root/'storage/app/private/scheduling-concurrency'/db
deadline=time.monotonic()+25
while not all((folder/('ready-'+str(i))).exists() for i in (1,2)):
 if time.monotonic()>deadline: raise RuntimeError('Workers did not reach test barrier')
 time.sleep(.03)
(folder/'go').write_text('go')
results=[]
for p in processes:
 out,err=p.communicate(timeout=40)
 if p.returncode: raise RuntimeError('Worker failed '+err[:600])
 results.append(json.loads(out))
verify=call('verify')
result={'setup':setup,'workers':results,'verify':verify,'pass':sorted(x['status'] for x in results)==[201,422] and verify['appointments']==1}
(root/'docs/scheduling/2026-11-10/mysql-concurrency.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
if not result['pass']: raise SystemExit(1)
