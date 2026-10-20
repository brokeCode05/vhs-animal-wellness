<?php

namespace App\Support;

use App\Models\AuditLog;
use App\Models\User;

class AuditWriter
{
    public static function write(?User $actor, string $action, string $entityType, int $entityId, string $description, ?string $referenceNo = null, ?array $metadata = null): void
    {
        if (! $actor) {
            return;
        }
        $log = new AuditLog;
        $log->forceFill([
            'actor_type' => $actor->role,
            'actor_id' => $actor->id,
            'actor_name' => $actor->name,
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'reference_no' => $referenceNo,
            'description' => mb_substr($description, 0, 255),
            'metadata' => $metadata,
        ])->save();
    }
}
