<?php
/** Offline regression: exercise the ACTUAL SemanticVettiService date-grounding logic. */
if (!function_exists('mb_strtolower')) {
    function mb_strtolower(string $text): string { return strtolower($text); }
}
require dirname(__DIR__) . '/app/Services/AI/SemanticVettiService.php';

$class = new ReflectionClass(\App\Services\AI\SemanticVettiService::class);
$service = $class->newInstanceWithoutConstructor();
$method = $class->getMethod('dateExpressionGrounded');
$cases = [
    ['Gusto ko sana paliguan si PET_1 bukas.', 'tomorrow', true],
    ['Gusto ko sana paliguan si PET_1 bukas.', 'bukas', true],
    ['Please book PET_1 today.', 'ngayon', true],
    ['Pwede ngayon para kay PET_1?', 'today', true],
    ['Can PET_1 have a bath tomorrow?', 'tomorrow', true],
    ['Can PET_1 have a bath?', 'tomorrow', false],
    ['Book PET_1 the day after tomorrow.', 'tomorrow', false],
    ['Book PET_1 the day after tomorrow.', 'day after tomorrow', true],
    ['Gusto ko sa makalawa.', 'day after tomorrow', true],
    ['Book PET_1 today or tomorrow.', 'tomorrow', false],
    ['Book PET_1 tomorrow and makalawa.', 'tomorrow', false],
    ['Tomorrow would be fine.', 'today', false],
    ['Book PET_1 on November 30, 2026.', 'November 30, 2026', true],
    ['Book PET_1 on 2026-10-25.', '2026-10-25', true],
    ['Book PET_1 on 11/30/26.', '2026-11-30', false],
    ['Book PET_1 tomorrow.', 'morrow', false],
];
foreach ($cases as $index => [$utterance, $expression, $expected]) {
    $actual = $method->invoke($service, $utterance, $expression);
    if ($actual !== $expected) {
        fwrite(STDERR, 'FAIL date grounding case ' . ($index + 1) . ": expression=$expression\n");
        exit(1);
    }
}
echo 'PASS: semantic date grounding (' . count($cases) . " assertions)\n";
