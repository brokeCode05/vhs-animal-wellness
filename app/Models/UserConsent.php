<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserConsent extends Model
{
    protected $table = 'user_consents';

    public const UPDATED_AT = null;

    public $timestamps = false;

    protected function casts(): array
    {
        return ['accepted_at' => 'datetime'];
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
