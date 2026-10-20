<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AccessLog extends Model
{
    protected $table = 'access_logs';

    public const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'status_code' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new \LogicException('Access log records are immutable.'));
        static::deleting(fn () => throw new \LogicException('Access log records are immutable.'));
    }
}
