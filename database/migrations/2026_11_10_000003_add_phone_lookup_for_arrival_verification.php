<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{Schema,DB,Crypt};
return new class extends Migration {
    public function up():void {
        Schema::table('users',fn(Blueprint $t)=>$t->char('phone_lookup_hash',64)->nullable()->index());
        DB::table('users')->select(['id','phone','phone_encrypted'])->orderBy('id')->chunkById(200,function($rows){
            foreach($rows as $row){
                try{$phone=$row->phone_encrypted ? Crypt::decryptString($row->phone_encrypted) : $row->phone;}
                catch(\Illuminate\Contracts\Encryption\DecryptException){continue;}
                DB::table('users')->where('id',$row->id)->update(['phone_lookup_hash'=>\App\Support\ContactLookup::phoneHash($phone)]);
            }
        });
    }
    public function down():void {Schema::table('users',fn(Blueprint $t)=>$t->dropColumn('phone_lookup_hash'));}
};
