<?php
// Diagnostic test only: never print credentials, prompts, or provider bodies.
require __DIR__.'/../vendor/autoload.php';$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use Illuminate\Support\Facades\Http;
$allow=['retry-after','x-ratelimit-limit-requests','x-ratelimit-remaining-requests','x-ratelimit-reset-requests','x-ratelimit-limit-tokens','x-ratelimit-remaining-tokens','x-ratelimit-reset-tokens'];
$models=['gemini'=>config('ai.model'),'groq'=>config('ai.groq_model')];
foreach(['gemini','groq'] as $name) {
 try {
  if($name==='gemini') $r=Http::timeout(20)->withHeaders(['x-goog-api-key'=>config('ai.api_key')])->post('https://generativelanguage.googleapis.com/v1beta/models/'.config('ai.model').':generateContent',['contents'=>[['role'=>'user','parts'=>[['text'=>'Reply OK.']]]],'generationConfig'=>['maxOutputTokens'=>64]]);
  else $r=Http::timeout(20)->withToken(config('ai.groq_api_key'))->post('https://api.groq.com/openai/v1/chat/completions',['model'=>config('ai.groq_model'),'messages'=>[['role'=>'user','content'=>'Reply OK.']],'max_completion_tokens'=>64]);
  $headers=[];foreach($allow as $key){$value=$r->header($key);if(is_string($value) && preg_match('/^[0-9a-zA-Z.,: +\-]+$/D',$value) && strlen($value)<=100)$headers[$key]=$value;}
  $code=$r->json('error.code');if(!is_string($code) || !in_array($code,['rate_limit_exceeded','resource_exhausted','insufficient_quota'],true))$code=null;
  echo json_encode(['provider'=>$name,'model'=>$models[$name],'status'=>$r->status(),'error_code'=>$code,'headers'=>$headers],JSON_UNESCAPED_SLASHES)."\n";
 }catch(Throwable $e){echo json_encode(['provider'=>$name,'error'=>'request_failed'])."\n";}
}
