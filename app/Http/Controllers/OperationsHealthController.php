<?php
namespace App\Http\Controllers;
use App\Support\ApiResponse;
use App\Services\AppointmentNoShowService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
final class OperationsHealthController extends Controller {
    use ApiResponse;
    public function show(AppointmentNoShowService $noShows) {
        $last=Cache::get('vhs:scheduler:last_no_show_run');
        $healthy=is_string($last) && Carbon::parse($last)->gte(now()->subMinutes(3));
        return $this->ok('Operational status loaded.', [
            'scheduler_reporting'=>$healthy, 'last_no_show_run'=>$last,
            'overdue_confirmed_visits'=>$noShows->countDue(),
            'transcript_retention_days'=>config('vhs.scribe_transcript_retention_days'),
        ])->header('Cache-Control','no-store');
    }
}
