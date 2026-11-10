<?php
require dirname(__DIR__).'/vendor/autoload.php';$app=require dirname(__DIR__).'/bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$c=config('vhs.twilio');echo json_encode(['email_transport'=>config('mail.default'),'sms_driver'=>config('vhs.sms_driver'),'sms_configured'=>config('vhs.sms_driver')==='twilio' && !empty($c['sid']) && !empty($c['token']) && (!empty($c['from']) || !empty($c['messaging_service_sid']))],JSON_PRETTY_PRINT).PHP_EOL;
