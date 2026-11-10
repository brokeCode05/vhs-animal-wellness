<?php
// Synthetic grounded reply regression; calls the real V3 server response path.
require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->instance('config', new Illuminate\Config\Repository(['ai'=>['enabled'=>true,'max_input_bytes'=>16000]]));
$provider = new class implements App\Services\AI\AiProviderInterface {
    public string $reply = '';
    public function generate(string $instructions,string $message,?array $jsonSchema=null): array { return ['text'=>$this->reply,'usage'=>[]]; }
};
$facts = new class extends App\Services\AI\PublicClinicFacts {
    public function load(): array { return ['available'=>true,'address'=>'834 Fictional Driod Street','service_details'=>[]]; }
};
$service = new App\Services\AI\SemanticVettiService(new App\Services\AI\AiGateway($provider),new App\Services\AI\UserVettiFacts(),$facts);
$request = Illuminate\Http\Request::create('/','POST');
$request->setLaravelSession(new Illuminate\Session\Store('test',new Illuminate\Session\ArraySessionHandler(60)));
$method = (new ReflectionClass($service))->getMethod('groundedConversation');
$provider->reply='The clinic is at 834 Fictional Droid Street.';
if (($method->invoke($service,$request,'key','Where is the clinic?',[])['mode'] ?? '') !== 'fallback') throw new RuntimeException('Altered address was accepted.');
$provider->reply='The clinic is at 834 Fictional Driod Street.';
$result=$method->invoke($service,$request,'key','Where is the clinic?',[]);
if (($result['source'] ?? '') !== 'ai' || !str_contains($result['text'],'834 Fictional Driod Street')) throw new RuntimeException('Exact verified address rejected.');
echo "PASS: altered street address rejected; exact verified address accepted.\n";
