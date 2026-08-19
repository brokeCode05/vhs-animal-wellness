<?php
/**
 * send_email.php
 * Reusable PHPMailer wrapper for VHS.
 * Usage: require_once 'send_email.php'; sendEmail($to, $toName, $subject, $htmlBody);
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/../PHPMailer-7.1.1/src/PHPMailer.php';
require_once __DIR__ . '/../PHPMailer-7.1.1/src/SMTP.php';
require_once __DIR__ . '/../PHPMailer-7.1.1/src/Exception.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

/**
 * @param string $to       Recipient email address
 * @param string $toName   Recipient display name
 * @param string $subject  Email subject
 * @param string $htmlBody HTML email body
 * @return bool            true on success, false on failure
 */
function sendEmail(string $to, string $toName, string $subject, string $htmlBody): bool {
    $mail = new PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host       = MAIL_HOST;
        $mail->SMTPAuth   = true;
        $mail->Username   = MAIL_USERNAME;
        $mail->Password   = MAIL_PASSWORD;
        $mail->SMTPSecure = 'tls';
        $mail->Port       = MAIL_PORT;
        $mail->Timeout    = 5; // fail fast — don't block the caller

        $mail->setFrom(MAIL_FROM, MAIL_FROM_NAME);
        $mail->addAddress($to, $toName);

        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body    = $htmlBody;
        $mail->AltBody = strip_tags(str_replace(['<br>', '<br/>', '<br />'], "\n", $htmlBody));

        $mail->send();
        return true;
    } catch (Exception $e) {
        error_log('VHS Mailer Error: ' . $mail->ErrorInfo);
        return false;
    }
}

/**
 * Build and send an appointment confirmation email to the pet owner.
 *
 * @param array $appt  Associative array with keys:
 *                     owner_name, owner_email, pet_name, service,
 *                     appointment_date, appointment_time, notes
 */
function sendAppointmentConfirmation(array $appt): bool {
    $ownerName = htmlspecialchars($appt['owner_name'] ?? 'Pet Owner');
    $petName   = htmlspecialchars($appt['pet_name']   ?? 'your pet');
    $service   = htmlspecialchars(ucwords($appt['service'] ?? ''));
    $date      = htmlspecialchars($appt['appointment_date'] ?? '');
    $time      = htmlspecialchars($appt['appointment_time'] ?? '');
    $notes     = htmlspecialchars($appt['notes'] ?? '');

    // Format date nicely
    $dateFormatted = $date;
    if ($date) {
        $ts = strtotime($date);
        if ($ts) $dateFormatted = date('F j, Y', $ts);
    }

    $notesRow = $notes
        ? "<tr><td style='padding:8px 0;color:#6b7280;font-size:0.875rem;'>Notes</td>
               <td style='padding:8px 0;font-weight:600;color:#111827;'>" . $notes . "</td></tr>"
        : '';

    $html = "
    <!DOCTYPE html>
    <html>
    <head><meta charset='UTF-8'></head>
    <body style='margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;'>
      <table width='100%' cellpadding='0' cellspacing='0' style='background:#f3f4f6;padding:2rem 1rem;'>
        <tr><td align='center'>
          <table width='560' cellpadding='0' cellspacing='0' style='background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);'>
            <!-- Header -->
            <tr>
              <td style='background:linear-gradient(135deg,#6d4ab1,#8b5cf6);padding:2rem;text-align:center;'>
                <h1 style='color:#ffffff;margin:0;font-size:1.5rem;'>🐾 VHS Animal Wellness Center</h1>
                <p style='color:rgba(255,255,255,0.85);margin:0.5rem 0 0;font-size:0.95rem;'>Appointment Confirmation</p>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style='padding:2rem;'>
                <p style='color:#374151;font-size:1rem;margin:0 0 1.25rem;'>Hi <strong>{$ownerName}</strong>,</p>
                <p style='color:#374151;font-size:0.95rem;margin:0 0 1.5rem;line-height:1.6;'>
                  Your appointment for <strong>{$petName}</strong> has been successfully booked. Here are the details:
                </p>
                <!-- Details table -->
                <table width='100%' cellpadding='0' cellspacing='0' style='background:#f9fafb;border-radius:8px;padding:1rem 1.25rem;margin-bottom:1.5rem;'>
                  <tr>
                    <td style='padding:8px 0;color:#6b7280;font-size:0.875rem;width:40%;'>Service</td>
                    <td style='padding:8px 0;font-weight:600;color:#111827;'>{$service}</td>
                  </tr>
                  <tr>
                    <td style='padding:8px 0;color:#6b7280;font-size:0.875rem;border-top:1px solid #e5e7eb;'>Date</td>
                    <td style='padding:8px 0;font-weight:600;color:#111827;border-top:1px solid #e5e7eb;'>{$dateFormatted}</td>
                  </tr>
                  <tr>
                    <td style='padding:8px 0;color:#6b7280;font-size:0.875rem;border-top:1px solid #e5e7eb;'>Time</td>
                    <td style='padding:8px 0;font-weight:600;color:#111827;border-top:1px solid #e5e7eb;'>{$time}</td>
                  </tr>
                  <tr>
                    <td style='padding:8px 0;color:#6b7280;font-size:0.875rem;border-top:1px solid #e5e7eb;'>Pet</td>
                    <td style='padding:8px 0;font-weight:600;color:#111827;border-top:1px solid #e5e7eb;'>{$petName}</td>
                  </tr>
                  {$notesRow}
                </table>
                <p style='color:#374151;font-size:0.9rem;line-height:1.6;margin:0 0 1rem;'>
                  Please arrive <strong>10 minutes early</strong>. If you need to cancel or reschedule, please contact us as soon as possible.
                </p>
                <p style='color:#6b7280;font-size:0.85rem;margin:0;'>
                  Thank you for trusting VHS Animal Wellness Center with your pet's care. 🐾
                </p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style='background:#f9fafb;padding:1.25rem 2rem;text-align:center;border-top:1px solid #e5e7eb;'>
                <p style='color:#9ca3af;font-size:0.8rem;margin:0;'>
                  VHS Animal Wellness Center &nbsp;|&nbsp; This is an automated confirmation email.
                </p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>";

    return sendEmail(
        $appt['owner_email'],
        $ownerName,
        'Appointment Confirmed — VHS Animal Wellness Center',
        $html
    );
}
?>
