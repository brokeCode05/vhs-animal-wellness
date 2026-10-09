<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Support\ApiResponse;
use Illuminate\Http\Request;

class AuditLogsController extends Controller
{
    use ApiResponse;
    public function index(Request $r)
    {
        $q=AuditLog::query()->orderByDesc('created_at');
        if($r->filled('actor_type'))$q->where('actor_type',$r->string('actor_type'));
        if($r->filled('entity_type'))$q->where('entity_type',$r->string('entity_type'));
        if($r->filled('date'))$q->whereDate('created_at',$r->string('date'));
        $items=$q->limit(1000)->get()->map(fn($a)=>['auditId'=>$a->id,'actorType'=>$a->actor_type,'actorId'=>$a->actor_id,'actorName'=>$a->actor_name,'action'=>$a->action,'entityType'=>$a->entity_type,'entityId'=>$a->entity_id,'referenceNo'=>$a->reference_no,'description'=>$a->description,'metadata'=>$a->metadata,'createdAt'=>optional($a->created_at)->toIso8601String()]);
        return $this->ok('Audit logs loaded.',['auditLogs'=>$items]);
    }
}
