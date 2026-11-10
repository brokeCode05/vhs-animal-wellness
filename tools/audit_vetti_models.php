<?php
// Synthetic-only, read-only diagnostic. Never prints credentials or real records.
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$schema = [
    'type'=>'object',
    'properties'=>[
        'intent'=>['type'=>'string','enum'=>['booking','booking_followup','booking_help','appointment_policy','appointment_history','reschedule','cancel','records','clinic_info','medical','other']],
        'pet_ref'=>['type'=>'string','enum'=>['none','PET_1']],
        'service'=>['type'=>'string','enum'=>['none','grooming','vaccination','consultation','deworming','microchipping','spay','neuter','boarding','confinement','dental']],
        'date_expression'=>['type'=>'string'],
        'time_preference'=>['type'=>'string','enum'=>['none','morning','afternoon','evening']],
        'negated'=>['type'=>'boolean'],'multiple_services'=>['type'=>'boolean'],'needs_clarification'=>['type'=>'boolean'],
    ],
    'required'=>['intent','pet_ref','service','date_expression','time_preference','negated','multiple_services','needs_clarification'],
    'additionalProperties'=>false,
];
$instructions = 'Interpret anonymized veterinary clinic chat in English, Filipino and Taglish. Return only JSON. This is read-only. Use only PET_N aliases present; never invent pets. Use booking_followup when supplying or changing a missing detail in the previous proposed booking, not for unrelated queries. A question about booking is booking_help. Copy date_expression from the current utterance; never calculate dates. Do not answer medical questions.';
$cases = [
    ['id'=>'indirect_booking','input'=>'Utterance: Can you help me arrange grooming for PET_1 tomorrow afternoon?'],
    ['id'=>'missing_pet','input'=>'Utterance: I want an appointment for grooming tomorrow afternoon.'],
    ['id'=>'pet_followup','input'=>"Utterance: Si PET_1 po.\nPrevious proposed booking (not confirmed): pet=none; service=grooming; date=2026-10-29; time_preference=afternoon"],
    ['id'=>'two_questions','input'=>'Utterance: May grooming ba kayo, at paano ako magpa-appointment?'],
];
$models = [config('ai.model')];
config(['ai.timeout'=>12, 'ai.connect_timeout'=>5]);
foreach (array_unique($models) as $model) {
    config(['ai.model'=>$model]);
    foreach ($cases as $case) {
        $start = microtime(true);
        try {
            $result = (new App\Services\AI\Providers\GeminiProvider())->generate($instructions, $case['input'], $schema);
            $row = ['model'=>$model,'case'=>$case['id'],'latency_ms'=>(int)((microtime(true)-$start)*1000),
                'response'=>json_decode($result['text'], true),'usage'=>$result['usage']];
        } catch (\App\Services\AI\AiProviderException $e) {
            $row = ['model'=>$model,'case'=>$case['id'],'latency_ms'=>(int)((microtime(true)-$start)*1000),'error'=>$e->category,'http_status'=>$e->httpStatus];
        } catch (Throwable $e) {
            $row = ['model'=>$model,'case'=>$case['id'],'latency_ms'=>(int)((microtime(true)-$start)*1000),'error'=>'unexpected'];
        }
        echo json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n";
        if (isset($row['error'])) break;
    }
}
