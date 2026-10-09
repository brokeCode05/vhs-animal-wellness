<?php

namespace App\Http\Controllers;

use App\Models\Document;
use App\Support\ApiResponse;
use App\Support\AuditWriter;
use Illuminate\Http\Request;

class DocumentsController extends Controller
{
    use ApiResponse;
    private function present(Document $d): array
    {
        $d->loadMissing(['appointment','user','pet']);
        return ['docId'=>$d->id,'id'=>$d->id,'type'=>$d->type,'status'=>$d->status,'appointmentId'=>$d->appointment_id,'referenceNo'=>$d->appointment?->reference_no,'userId'=>$d->user_id,'petId'=>$d->pet_id,'petName'=>$d->pet?->name,'ownerName'=>$d->user?->name,'service'=>$d->service_label,'veterinarian'=>$d->veterinarian_name?['name'=>$d->veterinarian_name,'role'=>'Veterinarian']:null,'issuedAt'=>optional($d->issued_at)->toIso8601String(),'data'=>$d->payload];
    }
    public function index(Request $r)
    {
        $q=Document::with(['appointment','user','pet'])->orderByDesc('issued_at');$u=$r->user();
        if($u->role==='User')$q->where('user_id',$u->id);
        elseif($u->role==='Doctor')$q->whereHas('appointment',fn($aq)=>$aq->where('assigned_vet_id',$u->doctorProfile?->id));
        if($r->filled('pet_id')){ $pet=(int)$r->input('pet_id'); if($u->role==='User')$q->where('user_id',$u->id); $q->where('pet_id',$pet); }
        if($r->filled('type'))$q->where('type',$r->string('type'));
        return $this->ok('Documents loaded.',['documents'=>$q->get()->map(fn($d)=>$this->present($d))->values()]);
    }
    public function show(Request $r, Document $document)
    {
        $u=$r->user();
        if($u->role==='User')abort_unless($document->user_id===$u->id,403,'Access denied.');
        elseif($u->role==='Doctor')abort_unless($document->appointment?->assigned_vet_id===$u->doctorProfile?->id,403,'Access denied.');

        AuditWriter::write(
            $u,
            'document_viewed',
            'document',
            $document->id,
            $u->name.' viewed '.$document->type.' document'.($document->appointment?->reference_no ? ' for '.$document->appointment->reference_no : '').'.',
            $document->appointment?->reference_no,
            ['documentType' => $document->type]
        );

        return $this->ok('Document loaded.',['document'=>$this->present($document)]);
    }
}
