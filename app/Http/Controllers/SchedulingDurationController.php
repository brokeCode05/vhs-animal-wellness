<?php
namespace App\Http\Controllers;
use App\Models\Service;
use App\Services\ServiceDurationEstimator;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
final class SchedulingDurationController extends Controller {
    use ApiResponse;
    public function index(Request $request, ServiceDurationEstimator $estimator) {
        abort_unless($request->user()?->role === 'Admin',403,'Access denied.');
        abort_unless($estimator->available(),503,'Scheduling settings need the database update.');
        return $this->ok('Duration estimates loaded.',['services'=>Service::query()->orderBy('id')->get()->map(fn($s)=>['serviceId'=>$s->id,'label'=>$s->label,'active'=>(bool)$s->active,'estimate'=>$estimator->profile($s)])->values()]);
    }
}
