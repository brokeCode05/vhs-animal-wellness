<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Encrypted, unfinished working state; never part of a finalized SOAP record. */
final class ConsultationWorkingDraft extends Model
{
    protected $table = 'consultation_working_drafts';
    protected $hidden = ['payload'];

    protected function casts(): array
    {
        return ['payload'=>'encrypted:array', 'revision'=>'integer'];
    }
}
