<?php
/** Synthetic, disposable MySQL test only; never resets the configured clinic database. */
require dirname(__DIR__).'/vendor/autoload.php';
$app=require dirname(__DIR__).'/bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use Illuminate\Support\Facades\{DB,Artisan};
use App\Models\{User,Pet,Service,DoctorProfile,Appointment};
use App\Support\AppointmentWorkflow;
$db=(string)getenv('VHS_SCHEDULING_TEST_DB');$mode=$argv[1]??'';$worker=$argv[2]??'';
if(!preg_match('/\Avhs_sched_test_[0-9]{8}_[a-f0-9]{8}\z/',$db))throw new RuntimeException('A unique scheduling test database is required.');
$original=DB::connection()->getDatabaseName();if($db===$original)throw new RuntimeException('Refusing the clinic database.');
$dir=storage_path('app/private/scheduling-concurrency/'.$db);if(!is_dir($dir))mkdir($dir,0700,true);
config(['mail.default'=>'array','cache.default'=>'array','session.driver'=>'array','queue.default'=>'sync','services.sms.enabled'=>false]);
if($mode==='setup') {
    if(DB::selectOne('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',[$db]))throw new RuntimeException('Test database already exists; refusing to reuse it.');
    DB::statement('CREATE DATABASE `'.$db.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
}
config(['database.default'=>'mysql','database.connections.mysql.database'=>$db]);DB::purge('mysql');DB::reconnect('mysql');
if(DB::connection()->getDatabaseName()!==$db)throw new RuntimeException('Test connection verification failed.');
if($mode==='setup') {
    Artisan::call('migrate',['--force'=>true]);
    $u=User::factory()->create(['role'=>'Admin','email'=>'synthetic-admin@example.test']);
    $o=User::factory()->create(['role'=>'User','email'=>'synthetic-owner@example.test']);
    $d=User::factory()->create(['role'=>'Doctor','email'=>'synthetic-doctor@example.test']);
    $doctor=DoctorProfile::forceCreate(['user_id'=>$d->id,'display_name'=>'Synthetic Doctor','account_status'=>'active','availability_status'=>'on_duty']);
    $p=Pet::forceCreate(['owner_id'=>$o->id,'name'=>'Synthetic Pet','species'=>'Dog','gender'=>'Female']);
    $s=Service::forceCreate(['value'=>'consultation','label'=>'Synthetic Consultation','category'=>'Test','price'=>100,'active'=>true,'duration_minutes'=>45]);
    AppointmentWorkflow::settings()->forceFill(['weekday_first'=>'09:00','weekday_last'=>'18:00','weekend_first'=>'09:00','weekend_last'=>'18:00','slot_interval_minutes'=>15])->save();
    file_put_contents($dir.'/fixture.json',json_encode(['admin'=>$u->id,'owner'=>$o->id,'pet'=>$p->id,'service'=>$s->id,'date'=>now()->addDay()->toDateString()]));
    echo json_encode(['setup'=>'ok','database'=>$db]);exit;
}
if(!is_file($dir.'/fixture.json'))throw new RuntimeException('Missing synthetic fixture marker.');
if($mode==='worker') {
    if(!in_array($worker,['1','2'],true))throw new RuntimeException('Invalid worker.');
    $f=json_decode(file_get_contents($dir.'/fixture.json'),true);$actor=User::findOrFail($f['admin']);
    try {
        DB::transaction(function()use($f,$actor,$dir,$worker){
            // Reproduce the harder OTP case: outer transaction established a
            // repeatable-read snapshot BEFORE either request takes the gate.
            Appointment::count();file_put_contents($dir.'/ready-'.$worker,'ready');
            $deadline=microtime(true)+20;while(!is_file($dir.'/go')){if(microtime(true)>$deadline)throw new RuntimeException('Barrier timed out.');usleep(20000);}
            $r=Illuminate\Http\Request::create('/api/appointments','POST',['user_id'=>$f['owner'],'pet_id'=>$f['pet'],'service_id'=>$f['service'],'appointment_date'=>$f['date'],'appointment_time'=>$worker==='1'?'10:00':'10:15','is_test'=>true]);
            $r->setUserResolver(fn()=>$actor);
            app(App\Http\Controllers\AppointmentsController::class)->store($r);
        });
        echo json_encode(['worker'=>$worker,'status'=>201]);
    }catch(Symfony\Component\HttpKernel\Exception\HttpException $e){echo json_encode(['worker'=>$worker,'status'=>$e->getStatusCode()]);}
    exit;
}
if($mode==='verify') {
    echo json_encode(['appointments'=>Appointment::count(),'test_records'=>Appointment::where('is_test',true)->count(),'database'=>$db,'retained_for_review'=>true]);exit;
}
throw new RuntimeException('Choose setup, worker or verify.');
