<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        DB::table('clinic_settings')->updateOrInsert(['id' => 1], [
            'weekday_first' => '09:00:00', 'weekday_last' => '17:00:00',
            'weekend_first' => '10:00:00', 'weekend_last' => '18:00:00',
            'slot_interval_minutes' => 60, 'cancel_cutoff_minutes' => 120,
            'reschedule_cutoff_minutes' => 120, 'noshow_grace_minutes' => 15,
            'clinic_name' => 'VHS Animal Wellness Center',
            'clinic_phone' => '0917 108 4174',
            'clinic_email' => 'vhs.animalwellness@gmail.com',
            'clinic_website' => 'www.vhsclinic.com',
            'clinic_address' => '834 Aurora Boulevard cor Driod Street, Kaunlaran, Cubao, Quezon City, Philippines, 1111',
            'updated_at' => now(),
        ]);

        foreach (json_decode(file_get_contents(__DIR__.'/service-prices.json'), true, 512, JSON_THROW_ON_ERROR) as $s) {
            if ($s['approved_price'] === null) continue;
            if (! is_numeric($s['approved_price']) || $s['approved_price'] < 0) throw new \RuntimeException('Invalid approved price: '.$s['value']);
            DB::table('services')->updateOrInsert(['value' => $s['value']], [
                'label' => $s['label'], 'category' => $s['category'], 'price' => $s['approved_price'],
                'currency' => 'PHP', 'active' => true, 'updated_at' => now(),
            ]);
        }
        $this->command?->warn('Defense/local seed loaded the 26 frozen service keys. Numeric booking prices are provisional lower-bound values from the existing frontend; get clinic approval before production.');
    }
}
