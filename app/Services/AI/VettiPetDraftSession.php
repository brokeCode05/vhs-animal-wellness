<?php
namespace App\Services\AI;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;

/** Bounded encrypted form fields only; no raw messages, provider text or records. */
final class VettiPetDraftSession
{
 private static function key(int $owner,string $chat):string{return hash('sha256',$owner.'|'.$chat);}
 public static function read(Request $request,int $owner,string $chat):array {
  $all=$request->session()->get('vetti.pet.registration',[]);$entry=is_array($all)?($all[self::key($owner,$chat)]??null):null;
  if(!is_array($entry) || ($entry['until']??0)<=time())return [];
  try{$v=json_decode(Crypt::decryptString($entry['value']),true);return is_array($v)?$v:[];}catch(\Throwable){return [];}
 }
 public static function write(Request $request,int $owner,string $chat,array $fields):void {
  $all=$request->session()->get('vetti.pet.registration',[]);if(!is_array($all))$all=[];
  $all=array_filter($all,fn($v)=>is_array($v)&&($v['until']??0)>time());$key=self::key($owner,$chat);$reset=$all[$key]['reset_id']??null;unset($all[$key]);
  $fields=array_intersect_key($fields,array_flip(['name','species','speciesCustom','breed','gender','age','ageUnit','weightKg']));
  $all[$key]=['until'=>time()+600,'value'=>Crypt::encryptString(json_encode($fields,JSON_UNESCAPED_UNICODE))];
  if($reset!==null)$all[$key]['reset_id']=$reset;
  while(count($all)>6)array_shift($all);$request->session()->put('vetti.pet.registration',$all);
 }
 /** An explicit browser dismissal/save resets once, even across repeated requests. */
 public static function applyReset(Request $request,int $owner,string $chat,?string $token):void {
  if($token===null || !preg_match('/\A[a-zA-Z0-9_-]{8,64}\z/',$token))return;
  $all=$request->session()->get('vetti.pet.registration',[]);$key=self::key($owner,$chat);
  if(is_array($all) && ($all[$key]['reset_id']??null)===$token)return;
  self::write($request,$owner,$chat,[]);
  $all=$request->session()->get('vetti.pet.registration',[]);$all[$key]['reset_id']=$token;
  $request->session()->put('vetti.pet.registration',$all);
  $topicKey='vetti_recent_topic_'.hash('sha256',$owner.'|'.$chat);
  $topic=$request->session()->get($topicKey);
  if(is_array($topic) && ($topic['topic']??null)==='pet_add')$request->session()->forget($topicKey);
 }
 public static function forget(Request $request,int $owner,string $chat):void {
  $all=$request->session()->get('vetti.pet.registration',[]);if(is_array($all)){unset($all[self::key($owner,$chat)]);$request->session()->put('vetti.pet.registration',$all);}
 }
}
