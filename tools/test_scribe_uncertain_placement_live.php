<?php
require __DIR__.'/../vendor/autoload.php';$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$g=new App\Services\AI\AiGateway(new App\Services\AI\Providers\GeminiProvider());$g->startScribeDeadline(20);
$items=[['reason'=>'uncertain_category','text'=>'hindi pa sure ang cause','source'=>'Sabi ng vet hindi pa sure ang cause.','sourceOffset'=>0]];
echo json_encode((new App\Services\AI\ScribeUncertainPlacement($g))->suggest($items),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)."\n";
