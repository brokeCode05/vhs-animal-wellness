<?php
// Non-sensitive live probe. Never print prompts, provider response bodies, or credentials.
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$provider=new class implements App\Services\AI\AiProviderInterface {
    public array $calls=[];
    public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
        $start=microtime(true); $category='ok';
        try { return (new App\Services\AI\Providers\GeminiProvider())->generate($instructions,$message,$jsonSchema); }
        catch (App\Services\AI\AiProviderException $e) { $category=$e->category; throw $e; }
        catch (Throwable $e) { $category='other_error'; throw $e; }
        finally { $this->calls[]=['stage'=>$jsonSchema===null?'response':'interpretation','seconds'=>round(microtime(true)-$start,2),'category'=>$category]; }
    }
};
$facts=new class extends App\Services\AI\UserVettiFacts {
    public function pets(App\Models\User $user):array{return [['id'=>777,'name'=>'Fictionalpet','species'=>'Dog']];}
};
$user=new App\Models\User();$user->setRawAttributes(['id'=>999]);
$service=new App\Services\AI\SemanticVettiService(new App\Services\AI\AiGateway($provider),$facts,new App\Services\AI\PublicClinicFacts());
foreach (['Show my pets','Ipakita ang mga alaga ko'] as $i=>$message) {
    $provider->calls=[];
    $request=Illuminate\Http\Request::create('/','POST');
    $request->setLaravelSession(new Illuminate\Session\Store('probe',new Illuminate\Session\ArraySessionHandler(60)));
    $start=microtime(true);
    $result=$service->interpret($request,$user,$message,'chat_synthetic_probe_12345');
    echo json_encode(['scenario'=>$i===0?'English':'Filipino','total_seconds'=>round(microtime(true)-$start,2),'mode'=>$result['mode']??null,'kind'=>$result['kind']??null,'source'=>$result['source']??null,'calls'=>$provider->calls],JSON_UNESCAPED_SLASHES).PHP_EOL;
}
