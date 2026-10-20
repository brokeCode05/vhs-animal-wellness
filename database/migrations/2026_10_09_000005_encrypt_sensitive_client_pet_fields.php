<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('phone_encrypted')->nullable()->after('phone');
            $table->text('address_encrypted')->nullable()->after('address');
            $table->text('birthdate_encrypted')->nullable()->after('birthdate');
        });

        Schema::table('pets', function (Blueprint $table) {
            $table->text('birthdate_encrypted')->nullable()->after('birthdate');
            $table->text('microchip_id_encrypted')->nullable()->after('microchip_id');
            $table->text('allergies_encrypted')->nullable()->after('allergies');
            $table->text('chronic_conditions_encrypted')->nullable()->after('chronic_conditions');
            $table->text('notes_encrypted')->nullable()->after('notes');
        });

        DB::table('users')
            ->select(['id', 'phone', 'address', 'birthdate'])
            ->orderBy('id')
            ->chunkById(100, function ($rows) {
                foreach ($rows as $row) {
                    DB::table('users')
                        ->where('id', $row->id)
                        ->update([
                            'phone_encrypted' => $this->encryptNullable($row->phone),
                            'address_encrypted' => $this->encryptNullable($row->address),
                            'birthdate_encrypted' => $this->encryptNullable($row->birthdate),
                            // Remove the plaintext-at-rest copies after the
                            // encrypted values have been generated.
                            'phone' => null,
                            'address' => null,
                            'birthdate' => null,
                        ]);
                }
            });

        DB::table('pets')
            ->select([
                'id',
                'birthdate',
                'microchip_id',
                'allergies',
                'chronic_conditions',
                'notes',
            ])
            ->orderBy('id')
            ->chunkById(100, function ($rows) {
                foreach ($rows as $row) {
                    DB::table('pets')
                        ->where('id', $row->id)
                        ->update([
                            'birthdate_encrypted' => $this->encryptNullable($row->birthdate),
                            'microchip_id_encrypted' => $this->encryptNullable($row->microchip_id),
                            'allergies_encrypted' => $this->encryptNullable($row->allergies),
                            'chronic_conditions_encrypted' => $this->encryptNullable($row->chronic_conditions),
                            'notes_encrypted' => $this->encryptNullable($row->notes),
                            // Remove plaintext-at-rest copies after successful
                            // encryption.
                            'birthdate' => null,
                            'microchip_id' => null,
                            'allergies' => null,
                            'chronic_conditions' => null,
                            'notes' => null,
                        ]);
                }
            });
    }

    public function down(): void
    {
        // Restore readable plaintext only for a deliberate rollback.
        DB::table('users')
            ->select(['id', 'phone_encrypted', 'address_encrypted', 'birthdate_encrypted'])
            ->orderBy('id')
            ->chunkById(100, function ($rows) {
                foreach ($rows as $row) {
                    DB::table('users')
                        ->where('id', $row->id)
                        ->update([
                            'phone' => $this->decryptNullable($row->phone_encrypted),
                            'address' => $this->decryptNullable($row->address_encrypted),
                            'birthdate' => $this->decryptNullable($row->birthdate_encrypted),
                        ]);
                }
            });

        DB::table('pets')
            ->select([
                'id',
                'birthdate_encrypted',
                'microchip_id_encrypted',
                'allergies_encrypted',
                'chronic_conditions_encrypted',
                'notes_encrypted',
            ])
            ->orderBy('id')
            ->chunkById(100, function ($rows) {
                foreach ($rows as $row) {
                    DB::table('pets')
                        ->where('id', $row->id)
                        ->update([
                            'birthdate' => $this->decryptNullable($row->birthdate_encrypted),
                            'microchip_id' => $this->decryptNullable($row->microchip_id_encrypted),
                            'allergies' => $this->decryptNullable($row->allergies_encrypted),
                            'chronic_conditions' => $this->decryptNullable($row->chronic_conditions_encrypted),
                            'notes' => $this->decryptNullable($row->notes_encrypted),
                        ]);
                }
            });

        Schema::table('pets', function (Blueprint $table) {
            $table->dropColumn([
                'birthdate_encrypted',
                'microchip_id_encrypted',
                'allergies_encrypted',
                'chronic_conditions_encrypted',
                'notes_encrypted',
            ]);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'phone_encrypted',
                'address_encrypted',
                'birthdate_encrypted',
            ]);
        });
    }

    private function encryptNullable(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $plain = trim((string) $value);

        return $plain === '' ? null : Crypt::encryptString($plain);
    }

    private function decryptNullable(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return Crypt::decryptString($value);
    }
};
