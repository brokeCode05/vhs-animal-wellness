<?php

namespace App\Services;

use App\Models\Appointment;
use App\Support\AppointmentWorkflow;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class AppointmentConfirmationDelivery
{
    /**
     * Send the client-facing confirmation only after the appointment has
     * committed successfully to MySQL.
     *
     * Delivery failure must not roll back an already-created appointment.
     * Failures are written to the Laravel log for troubleshooting.
     */
    public function sendForAppointment(int $appointmentId): void
    {
        try {
            $appointment = Appointment::with([
                'user',
                'pet',
                'service',
                'veterinarian.user',
            ])->find($appointmentId);

            if (! $appointment || $appointment->status !== 'confirmed') {
                return;
            }

            $owner = $appointment->user;
            $email = trim((string) ($owner?->email ?? ''));

            if ($email === '') {
                Log::warning('VHS appointment confirmation skipped: client has no email.', [
                    'appointment_id' => $appointmentId,
                    'reference_no' => $appointment->reference_no,
                ]);
                return;
            }

            if (app()->isProduction() && in_array(config('mail.default'), ['log', 'array'], true)) {
                Log::warning('VHS appointment confirmation skipped: production mail transport is not configured.', [
                    'appointment_id' => $appointmentId,
                    'reference_no' => $appointment->reference_no,
                ]);
                return;
            }

            $settings = AppointmentWorkflow::settings();
            $clinicName = trim((string) ($settings->clinic_name ?: config('app.name', 'VHS Animal Wellness Center')));
            $clinicPhone = trim((string) ($settings->clinic_phone ?? ''));
            $clinicEmail = trim((string) ($settings->clinic_email ?? ''));
            $clinicAddress = trim((string) ($settings->clinic_address ?? ''));

            $ownerName = trim((string) ($owner?->name ?? ''));
            if ($ownerName === '') {
                $ownerName = trim(
                    (string) ($owner?->first_name ?? '')
                    . ' '
                    . (string) ($owner?->last_name ?? '')
                );
            }
            if ($ownerName === '') {
                $ownerName = 'Client';
            }

            $petName = trim((string) ($appointment->pet?->name ?? 'your pet'));

            $serviceName = trim((string) (
                $appointment->service_label_at_booking
                ?: $appointment->service?->label
                ?: $appointment->service?->value
                ?: 'Veterinary appointment'
            ));

            $date = optional($appointment->appointment_date)->format('F j, Y') ?: '';
            $time = Carbon::createFromFormat(
                'H:i:s',
                substr((string) $appointment->appointment_time, 0, 8)
            )->format('g:i A');

            $vetName = trim((string) (
                $appointment->veterinarian?->user?->name ?? ''
            ));

            $lines = [
                "Hello {$ownerName},",
                '',
                "Your appointment with {$clinicName} has been confirmed.",
                '',
                "Reference Number: {$appointment->reference_no}",
                "Pet: {$petName}",
                "Service: {$serviceName}",
                "Date: {$date}",
                "Time: {$time}",
            ];

            if ($vetName !== '') {
                $lines[] = "Veterinarian: {$vetName}";
            }

            if ($clinicAddress !== '' || $clinicPhone !== '' || $clinicEmail !== '') {
                $lines[] = '';
                $lines[] = 'Clinic Information:';

                if ($clinicAddress !== '') {
                    $lines[] = "Address: {$clinicAddress}";
                }
                if ($clinicPhone !== '') {
                    $lines[] = "Phone: {$clinicPhone}";
                }
                if ($clinicEmail !== '') {
                    $lines[] = "Email: {$clinicEmail}";
                }
            }

            $lines[] = '';
            $lines[] = 'Please keep your reference number for appointment lookup and front-desk assistance.';
            $lines[] = '';
            $lines[] = $clinicName;

            $body = implode(PHP_EOL, $lines);
            $subject = 'Appointment Confirmed - ' . $appointment->reference_no;

            Mail::raw($body, function ($message) use ($email, $ownerName, $subject) {
                $message->to($email, $ownerName)->subject($subject);
            });

            Log::info('VHS appointment confirmation email sent.', [
                'appointment_id' => $appointment->id,
                'reference_no' => $appointment->reference_no,
                'recipient' => $email,
            ]);
        } catch (\Throwable $e) {
            Log::warning('VHS appointment confirmation email failed.', [
                'appointment_id' => $appointmentId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
