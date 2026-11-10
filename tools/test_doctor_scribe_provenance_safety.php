<?php
// Standalone PHP audit: tests the production verifier without a live provider,
// database, patient records, .env or Laravel bootstrap.
require_once __DIR__.'/../app/Services/AI/DoctorScribeService.php';
$r = new ReflectionMethod(\App\Services\AI\DoctorScribeService::class, 'hasMeasuredVitalEvidence');
$scribe = (new ReflectionClass(\App\Services\AI\DoctorScribeService::class))->newInstanceWithoutConstructor();
$cases = [
  ['weightKg',8.5,'Weight 8.5 kg.',true],
  ['temperatureC',38.7,'Temperature 38.7 C.',true],
  ['heartRateBpm',110,'Heart rate 110 bpm.',true],
  ['weightKg',8,'Weight was recorded as 8 kg.',true],
  ['temperatureC',38.5,'Temperature was 38.5 C.',true],
  ['weightKg',8,'The owner reports the dog weighs 8 kg.',false],
  ['heartRateBpm',110,'Owner estimates 110 bpm. Heart rate 110 bpm yesterday.',false],
  ['weightKg',8,'Weight 8 kg last month.',false],
  ['temperatureC',38.5,'Temp 38.5 C recorded at home.',false],
  ['weightKg',6,'On exam weight 6 kg and 7 kg.',false],
  ['temperatureC',38.5,'Temperature 38.5 C and 39.5 C on repeat.',false],
  ['heartRateBpm',110,'Heart rate 110 bpm. Heart rate 125 bpm.',false],
  ['weightKg',9,'Weight 8 kg. Food served 9 kg.',false],
  ['weightKg',8,'Weight 8 kg. Temperature 39 C.',true],
  ['weightKg',8,'Weight 8 kg and was entered incorrectly.',false],
  ['weightKg',10,'Weight 8 kg last year. On exam weight 10 kg.',true],
  ['temperatureC',38.7,'Temperature 102 F.',false],
];
$failed=0;
foreach($cases as $i=>$c){$actual=$r->invoke($scribe,$c[0],$c[1],$c[2]);if($actual!==$c[3]){$failed++;echo 'FAIL '.($i+1).' '.($c[2]).' actual='.var_export($actual,true)."\n";} }
echo (count($cases)-$failed).'/'.count($cases)." backend vital-provenance checks passed\n";
$sectionMethod=new ReflectionMethod(\App\Services\AI\DoctorScribeService::class, 'sectionSourceIsSafe');
$sectionCases=[
  ['objective','Owner reports scratching.',false],
  ['objective','During examination redness observed.',true],
  ['subjective','During examination redness observed.',false],
  ['subjective','Owner reports poor appetite.',true],
  ['assessment','Owner reports vomiting.',false],
  ['assessment','Suspected ear irritation.',true],
  ['plan','On examination red ears.',false],
  ['plan','Recommend follow-up in three days.',true],
  ['objective','Not provided.',true],
];
foreach ($sectionCases as $i=>$c) {
 $actual=$sectionMethod->invoke($scribe,$c[0],$c[1]);
 if ($actual !== $c[2]) {$failed++;echo 'FAIL source section '.($i+1)."\n";}
}
echo (count($sectionCases)-($failed>0?$failed:0)).'/'.count($sectionCases)." source-section checks reported\n";
exit($failed?1:0);
