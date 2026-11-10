<?php
// Synthetic consultation only. No DB, HTTP, or Gemini calls.
declare(strict_types=1);
$settings = ['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true,'ai.max_input_bytes'=>4000];
function config(string $key, mixed $default = null): mixed { global $settings; return $settings[$key] ?? $default; }
require __DIR__.'/../app/Services/AI/AiProviderInterface.php';
require __DIR__.'/../app/Services/AI/SchemaValidator.php';
require __DIR__.'/../app/Services/AI/AiGateway.php';
require __DIR__.'/../app/Services/AI/DoctorScribeService.php';
use App\Services\AI\AiGateway;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\DoctorScribeService;
class FixtureProvider implements AiProviderInterface {
 public int $calls=0;
 public function __construct(public string $payload) {}
 public function generate(string $instructions, string $message, ?array $jsonSchema=null): array {$this->calls++;return ['text'=>$this->payload,'usage'=>[]];}
}
function must(bool $condition,string $msg): void { if (!$condition) throw new RuntimeException('FAIL '.$msg); }
function runDraft(string $transcript, array $soap): array {
 $f=new FixtureProvider(json_encode($soap,JSON_THROW_ON_ERROR));
 $result=(new DoctorScribeService(new AiGateway($f)))->draft($transcript);
 return [$result,$f->calls];
}
$transcript='Owner reports vomiting. On exam mild dehydration. Weight 8.5 kg. Temperature 38.7 C. Heart rate 110 bpm. Suspected upset. Monitor hydration.';
$soap=['subjective'=>'Owner reports vomiting.', 'objective'=>['findings'=>'On exam mild dehydration.','weightKg'=>8.5,'temperatureC'=>38.7,'heartRateBpm'=>110],'assessment'=>'Suspected upset.','plan'=>'Monitor hydration.'];
[$r,$calls]=runDraft($transcript,$soap);must($r['ok'] && $calls===1,'realistic grounded synthetic SOAP accepted');
$cases=0;
function reject(string $transcript,array $soap, string $error): void { global $cases;[$r,$calls]=runDraft($transcript,$soap);must($r['ok']===false && $r['code']===$error,'expected '.$error.' but got '.json_encode($r));$cases++;}
$changed=$soap;$changed['objective']['heartRateBpm']=120;reject($transcript,$changed,'ungrounded_vital');
$changed=$soap;$changed['assessment']='Confirmed cancer.';reject($transcript,$changed,'ungrounded_assessment');
$history='Owner reported weight 7 kg last month. On exam mild dehydration.';
$changed=$soap;$changed['subjective']='Owner reported weight 7 kg last month.';$changed['objective']=['findings'=>'On exam mild dehydration.','weightKg'=>7,'temperatureC'=>null,'heartRateBpm'=>null];$changed['assessment']='Not provided.';$changed['plan']='Not provided.';
reject($history,$changed,'ungrounded_vital');
$food='Patient received 8 kg of food. On exam mild dehydration.';
$changed['subjective']='Not provided.';$changed['objective']['weightKg']=8;
reject($food,$changed,'ungrounded_vital');
$f='Temperature 102.2 F. On exam mild dehydration.';$changed['objective']['weightKg']=null;$changed['objective']['temperatureC']=102.2;
reject($f,$changed,'ungrounded_vital');
$generic='Weight 8 kg. Temperature 38.5 C. Heart rate 120 bpm.';
$changed=['subjective'=>'Not provided.','objective'=>['findings'=>'Not provided.','weightKg'=>8,'temperatureC'=>38.5,'heartRateBpm'=>120],'assessment'=>'Not provided.','plan'=>'Not provided.'];
[$r,$c]=runDraft($generic,$changed);must($r['ok'] && $c===1,'clinician-labelled vitals accepted');
$settings['ai.clinical_clearance']=false;
[$r,$c]=runDraft($generic,$changed);must(!$r['ok'] && $c===0,'no Gemini call with clinical clearance disabled');
$settings['ai.clinical_clearance']=true;$settings['ai.paid_data_approved']=false;
[$r,$c]=runDraft($generic,$changed);must(!$r['ok'] && $c===0,'no Gemini call without paid data approval');
echo 'PASS: Doctor Scribe backend source grounding, vital provenance and privacy gates ('.($cases+4).' checks)' . PHP_EOL;
