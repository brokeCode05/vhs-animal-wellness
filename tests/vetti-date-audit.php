<?php
// Exercises the V3 date parser with a frozen clock; no database or provider.
require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->instance('config', new Illuminate\Config\Repository(['app'=>['timezone'=>'Asia/Manila']]));
Carbon\Carbon::setTestNow(Carbon\Carbon::parse('2026-10-30 12:00:00', 'Asia/Manila'));
$class = new ReflectionClass(App\Services\AI\SemanticVettiService::class);
$service = $class->newInstanceWithoutConstructor();
$parse = $class->getMethod('bookingDate');
$ground = $class->getMethod('dateExpressionGrounded');
$cases = [
    ['November 3', '2026-11-03'], ['November 3, 2026', '2026-11-03'],
    ['November 31', null], ['January 3', null], ['tomorrow', '2026-10-31'],
    ['2026-11-03', '2026-11-03'], ['2026-02-30', null],
];
foreach ($cases as [$input,$expected]) {
    $actual = $parse->invoke($service,$input);
    if ($actual !== $expected) throw new RuntimeException("Date test failed: $input");
}
if (!$ground->invoke($service,'Please book November 3','November 3') || $ground->invoke($service,'Please book November 3','November 4')) throw new RuntimeException('Grounding failed');
Carbon\Carbon::setTestNow(Carbon\Carbon::parse('2026-12-20 12:00:00', 'Asia/Manila'));
if ($parse->invoke($service,'January 3') !== '2027-01-03') throw new RuntimeException('Year boundary failed');
echo "PASS: 10 date parsing and grounding assertions against V3 code\n";
