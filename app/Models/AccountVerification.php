<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AccountVerification extends Model
{
    protected $table = 'account_verifications';

    public const UPDATED_AT = null;

    protected $hidden = ['code_hash', 'session_hash'];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'consumed_at' => 'datetime', 'created_at' => 'datetime'];
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
