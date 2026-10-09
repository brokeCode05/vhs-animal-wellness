<?php

namespace App\Http\Controllers;

use App\Models\Appointment;
use App\Models\AppointmentEvent;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use App\Services\AppointmentConfirmationDelivery;
use App\Support\ApiResponse;
use App\Support\AppointmentWorkflow;
use App\Support\AuditWriter;
use App\Support\VhsPresenter;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AppointmentsController extends Controller
{
    use ApiResponse;

    private function queryFor(Request $r)
    {
        $q = Appointment::with(['user', 'pet', 'service', 'veterinarian.user']);
        $u = $r->user();

        if ($u->role === 'User') {
            $q->where('user_id', $u->id);
        } elseif ($u->role === 'Doctor') {
            $doc = $u->doctorProfile;
            abort_unless($doc, 403, 'Doctor profile missing.');

            $q->where('assigned_vet_id', $doc->id)
              ->whereNotIn('status', ['canceled', 'no_show']);
        } elseif ($u->role !== 'Admin') {
            abort(403, 'Access denied.');
        }

        if ($r->filled('date')) {
            $q->whereDate('appointment_date', $r->string('date'));
        }

        if ($r->filled('status')) {
            $q->where('status', $r->string('status'));
        }

        if ($r->filled('reference_no')) {
            $q->where('reference_no', $r->string('reference_no'));
        }

        if ($u->role === 'Admin' && $r->filled('user_id')) {
            $q->where('user_id', (int) $r->input('user_id'));
        }

        if ($r->filled('pet_id')) {
            $q->where('pet_id', (int) $r->input('pet_id'));
        }

        return $q;
    }

    public function index(Request $r)
    {
        $items = $this->queryFor($r)
            ->orderBy('appointment_date')
            ->orderBy('appointment_time')
            ->get();

        return $this->ok('Appointments loaded.', [
            'appointments' => $items
                ->map(fn ($a) => VhsPresenter::appointment($a))
                ->values(),
        ]);
    }

    public function show(Request $r, Appointment $appointment)
    {
        $u = $r->user();

        if ($u->role === 'User') {
            abort_unless(
                $appointment->user_id === $u->id,
                403,
                'Access denied.'
            );
        } elseif ($u->role === 'Doctor') {
            abort_unless(
                $appointment->assigned_vet_id === $u->doctorProfile?->id,
                403,
                'Access denied.'
            );
        } elseif ($u->role !== 'Admin') {
            abort(403, 'Access denied.');
        }

        $appointment->load(['user', 'pet', 'service', 'veterinarian.user']);

        return $this->ok('Appointment loaded.', [
            'appointment' => VhsPresenter::appointment($appointment),
        ]);
    }

    public function store(Request $r)
    {
        $v = $r->validate([
            'user_id' => ['sometimes', 'integer', 'exists:users,id'],
            'pet_id' => ['required', 'integer', 'exists:pets,id'],
            'service' => ['required_without:service_id', 'nullable', 'string', 'max:100'],
            'service_id' => ['required_without:service', 'nullable', 'integer', 'exists:services,id'],
            'appointment_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'appointment_time' => ['required', 'string', 'max:20'],
            'visit_context' => ['nullable', 'string', 'max:120'],
            'visitContext' => ['nullable', 'string', 'max:120'],
            'visit_reason' => ['nullable', 'string', 'max:120'],
            'visitReason' => ['nullable', 'string', 'max:120'],
            'custom_visit_context' => ['nullable', 'string', 'max:255'],
            'customVisitContext' => ['nullable', 'string', 'max:255'],
            'visit_reason_custom' => ['nullable', 'string', 'max:255'],
            'visitReasonCustom' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $actor = $r->user();

        abort_unless(
            in_array($actor->role, ['User', 'Admin'], true),
            403,
            'Only Users and Admins may create appointments.'
        );

        $ownerId = $actor->role === 'Admin'
            ? (int) ($v['user_id'] ?? 0)
            : $actor->id;

        abort_if(
            $ownerId <= 0,
            422,
            'Owner is required for an Admin walk-in booking.'
        );

        $owner = User::whereKey($ownerId)
            ->where('role', 'User')
            ->firstOrFail();

        $pet = Pet::whereKey($v['pet_id'])->firstOrFail();

        abort_unless(
            $pet->owner_id === $owner->id,
            422,
            'The selected pet does not belong to the appointment owner.'
        );

        $service = isset($v['service_id'])
            ? Service::findOrFail($v['service_id'])
            : Service::where('value', $v['service'])->first();

        abort_unless(
            $service && $service->active,
            422,
            'service_inactive'
        );

        $time = AppointmentWorkflow::timeToHHMM($v['appointment_time']);

        abort_unless(
            $time,
            422,
            'Invalid appointment time.'
        );

        $appointment = DB::transaction(function () use (
            $v,
            $owner,
            $pet,
            $service,
            $time,
            $actor
        ) {
            AppointmentWorkflow::lockSchedulingGate();
            AppointmentWorkflow::validateSlot($v['appointment_date'], $time);

            $doctorId = AppointmentWorkflow::assignedDoctorId($v['appointment_date']);

            abort_unless(
                $doctorId,
                422,
                'No on-duty veterinarian is available for this appointment.'
            );

            $appointment = new Appointment;

            $appointment->forceFill([
                'reference_no' => AppointmentWorkflow::referenceNo($v['appointment_date']),
                'user_id' => $owner->id,
                'pet_id' => $pet->id,
                'assigned_vet_id' => $doctorId,
                'service_id' => $service->id,
                'service_label_at_booking' => $service->label,
                'price_at_booking' => $service->price,
                'appointment_date' => $v['appointment_date'],
                'appointment_time' => $time . ':00',
                'visit_context' => $v['visit_context']
                    ?? $v['visitContext']
                    ?? $v['visit_reason']
                    ?? $v['visitReason']
                    ?? null,
                'custom_visit_context' => $v['custom_visit_context']
                    ?? $v['customVisitContext']
                    ?? $v['visit_reason_custom']
                    ?? $v['visitReasonCustom']
                    ?? null,
                'notes' => trim((string) ($v['notes'] ?? '')) ?: null,
                'status' => 'confirmed',
                'created_via' => $actor->role === 'Admin' ? 'admin' : 'user',
            ])->save();

            $event = new AppointmentEvent;

            $event->forceFill([
                'appointment_id' => $appointment->id,
                'event_type' => 'created',
                'new_date' => $appointment->appointment_date,
                'new_time' => $appointment->appointment_time,
                'actor_type' => $actor->role,
                'actor_id' => $actor->id,
                'metadata' => [
                    'service' => $service->value,
                ],
            ])->save();

            AuditWriter::write(
                $actor,
                'appointment_created',
                'appointment',
                $appointment->id,
                $actor->name . ' created appointment ' . $appointment->reference_no . '.',
                $appointment->reference_no,
                [
                    'appointmentDate' => $v['appointment_date'],
                    'appointmentTime' => $time,
                    'service' => $service->value,
                ]
            );


            /*
             * REQ004 — appointment confirmation notification.
             *
             * Register afterCommit while the appointment transaction is active.
             * If this store() call is itself inside the booking-OTP transaction,
             * Laravel waits for the outermost transaction to commit. Therefore
             * an invalid OTP / rolled-back booking never receives a false
             * appointment confirmation.
             */
            DB::afterCommit(function () use ($appointment) {
                app(AppointmentConfirmationDelivery::class)
                    ->sendForAppointment((int) $appointment->id);
            });

            return $appointment;
        });

        $appointment->load(['user', 'pet', 'service', 'veterinarian.user']);

        return $this->ok(
            'Appointment created.',
            ['appointment' => VhsPresenter::appointment($appointment)],
            201
        );
    }

    public function update(Request $r, Appointment $appointment)
    {
        $actor = $r->user();

        abort_unless(
            $actor->role === 'Admin'
            || ($actor->role === 'User' && $appointment->user_id === $actor->id),
            403,
            'Access denied.'
        );

        abort_unless(
            in_array($appointment->status, ['confirmed', 'pending'], true),
            422,
            'Appointment cannot be rescheduled from its current status.'
        );

        /*
         * Both User and Admin follow the same clinic reschedule cutoff.
         * There is no Admin bypass for rescheduling.
         */
        abort_if(
            AppointmentWorkflow::cutoffBlocked($appointment, 'reschedule'),
            422,
            'cutoff_window'
        );

        $v = $r->validate([
            'appointment_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'appointment_time' => ['required', 'string', 'max:20'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $time = AppointmentWorkflow::timeToHHMM($v['appointment_time']);

        abort_unless(
            $time,
            422,
            'Invalid appointment time.'
        );

        $oldDate = $appointment->appointment_date->format('Y-m-d');
        $oldTime = substr((string) $appointment->appointment_time, 0, 5);
        $oldDoctorId = $appointment->assigned_vet_id;

        DB::transaction(function () use (
            $actor,
            $appointment,
            $v,
            $time,
            $oldDate,
            $oldTime,
            $oldDoctorId
        ) {
            AppointmentWorkflow::lockSchedulingGate();

            $locked = Appointment::whereKey($appointment->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless(
                in_array($locked->status, ['confirmed', 'pending'], true),
                422,
                'Appointment cannot be rescheduled from its current status.'
            );

            AppointmentWorkflow::validateSlot(
                $v['appointment_date'],
                $time,
                $locked->id
            );

            /*
             * Re-evaluate the Doctor when the appointment is rescheduled.
             * A confirmed appointment must always have an active, on-duty
             * veterinarian under the current VHS availability model.
             */
            $newDoctorId = AppointmentWorkflow::assignedDoctorId(
                $v['appointment_date']
            );

            abort_unless(
                $newDoctorId,
                422,
                'No on-duty veterinarian is available for this appointment.'
            );

            $locked->rescheduled_from = [
                'date' => $oldDate,
                'time' => $oldTime,
                'at' => now()->toIso8601String(),
            ];

            $locked->appointment_date = $v['appointment_date'];
            $locked->appointment_time = $time . ':00';
            $locked->assigned_vet_id = $newDoctorId;
            $locked->status = 'confirmed';

            if (array_key_exists('notes', $v)) {
                $locked->notes = $v['notes'];
            }

            $locked->save();

            $event = new AppointmentEvent;

            $event->forceFill([
                'appointment_id' => $locked->id,
                'event_type' => 'rescheduled',
                'old_date' => $oldDate,
                'old_time' => $oldTime . ':00',
                'new_date' => $v['appointment_date'],
                'new_time' => $time . ':00',
                'actor_type' => $actor->role,
                'actor_id' => $actor->id,
                'metadata' => [
                    'reason' => $v['notes'] ?? null,
                    'previousAssignedVetId' => $oldDoctorId,
                    'newAssignedVetId' => $newDoctorId,
                ],
            ])->save();

            AuditWriter::write(
                $actor,
                'appointment_rescheduled',
                'appointment',
                $locked->id,
                $actor->name . ' rescheduled ' . $locked->reference_no . '.',
                $locked->reference_no,
                [
                    'previousDate' => $oldDate,
                    'previousTime' => $oldTime,
                    'appointmentDate' => $v['appointment_date'],
                    'appointmentTime' => $time,
                    'previousAssignedVetId' => $oldDoctorId,
                    'newAssignedVetId' => $newDoctorId,
                ]
            );
        });

        $appointment = $appointment->fresh([
            'user',
            'pet',
            'service',
            'veterinarian.user',
        ]);

        return $this->ok('Appointment rescheduled.', [
            'appointment' => VhsPresenter::appointment($appointment),
        ]);
    }

    public function status(Request $r, Appointment $appointment)
    {
        $actor = $r->user();

        $v = $r->validate([
            'status' => [
                'required',
                Rule::in([
                    'confirmed',
                    'checked_in',
                    'in_consultation',
                    'completed',
                    'canceled',
                    'no_show',
                ]),
            ],
            'reason' => ['nullable', 'string', 'max:120'],
        ]);

        $next = $v['status'];

        if ($actor->role === 'User') {
            abort_unless(
                $appointment->user_id === $actor->id
                && $next === 'canceled',
                403,
                'Users may only cancel their own appointment.'
            );

            abort_if(
                AppointmentWorkflow::cutoffBlocked($appointment, 'cancel'),
                422,
                'cutoff_window'
            );
        } elseif ($actor->role === 'Doctor') {
            abort_unless(
                $appointment->assigned_vet_id === $actor->doctorProfile?->id,
                403,
                'This appointment is not assigned to you.'
            );

            abort_unless(
                in_array($next, ['in_consultation', 'completed'], true),
                403,
                'Doctor transition not permitted.'
            );
        } elseif ($actor->role === 'Admin') {
            abort_unless(
                in_array($next, ['confirmed', 'checked_in', 'canceled', 'no_show'], true),
                403,
                'Admin transition not permitted.'
            );
        } else {
            abort(403, 'Access denied.');
        }

        $from = $appointment->status;

        if ($next === 'checked_in') {
            $scheduled = Carbon::parse(
                $appointment->appointment_date->format('Y-m-d')
                . ' '
                . substr((string) $appointment->appointment_time, 0, 5)
            );

            abort_unless(
                $scheduled->isSameDay(now()),
                422,
                'Check-in is only available on the appointment date.'
            );

            abort_if(
                now()->lt($scheduled->copy()->subHours(2)),
                422,
                'Check-in is not available yet.'
            );
        }

        if ($next === 'no_show') {
            abort_unless(
                $actor->role === 'Admin' && $from === 'confirmed',
                422,
                'Only a confirmed appointment can be marked no-show.'
            );

            $scheduled = Carbon::parse(
                $appointment->appointment_date->format('Y-m-d')
                . ' '
                . substr((string) $appointment->appointment_time, 0, 5)
            );

            abort_if(
                now()->lt(
                    $scheduled->copy()->addMinutes(
                        (int) AppointmentWorkflow::settings()->noshow_grace_minutes
                    )
                ),
                422,
                'No-show grace period has not elapsed.'
            );
        } else {
            abort_unless(
                AppointmentWorkflow::canTransition($from, $next),
                422,
                'invalid_status'
            );
        }

        DB::transaction(function () use (
            $actor,
            $appointment,
            $from,
            $next,
            $v
        ) {
            $a = Appointment::whereKey($appointment->id)
                ->lockForUpdate()
                ->firstOrFail();

            /*
             * Re-read the current status after the row lock.
             * This prevents a stale request from silently overwriting a
             * status change made by another session.
             */
            abort_unless(
                $a->status === $from,
                409,
                'Appointment status changed. Please refresh and try again.'
            );

            if ($next === 'checked_in') {
                /*
                 * Ensure an on-duty veterinarian is attached before the
                 * patient enters the Doctor queue.
                 */
                $doctorId = AppointmentWorkflow::assignedDoctorId(
                    $a->appointment_date->format('Y-m-d')
                );

                abort_unless(
                    $doctorId,
                    422,
                    'No on-duty veterinarian is available for this appointment.'
                );

                $a->assigned_vet_id = $doctorId;
                $a->checked_in_at = now();
            }

            $a->status = $next;

            if ($next === 'in_consultation') {
                $a->consultation_started_at = now();
            }

            if ($next === 'completed') {
                $a->consultation_completed_at = now();
            }

            if ($next === 'canceled') {
                $a->canceled_reason = $v['reason'] ?? null;
            }

            $a->save();

            $event = new AppointmentEvent;

            $event->forceFill([
                'appointment_id' => $a->id,
                'event_type' => $next,
                'old_date' => $a->appointment_date,
                'old_time' => $a->appointment_time,
                'new_date' => $a->appointment_date,
                'new_time' => $a->appointment_time,
                'actor_type' => $actor->role,
                'actor_id' => $actor->id,
                'metadata' => [
                    'previousStatus' => $from,
                    'newStatus' => $next,
                    'reason' => $v['reason'] ?? null,
                ],
            ])->save();

            $action = AppointmentWorkflow::transitionAction($next);

            AuditWriter::write(
                $actor,
                $action,
                'appointment',
                $a->id,
                $actor->name
                    . ' changed '
                    . $a->reference_no
                    . ' from '
                    . $from
                    . ' to '
                    . $next
                    . '.',
                $a->reference_no,
                [
                    'previousStatus' => $from,
                    'newStatus' => $next,
                    'reason' => $v['reason'] ?? null,
                ]
            );
        });

        $appointment = $appointment->fresh([
            'user',
            'pet',
            'service',
            'veterinarian.user',
        ]);

        return $this->ok('Appointment status updated.', [
            'appointment' => VhsPresenter::appointment($appointment),
        ]);
    }
}