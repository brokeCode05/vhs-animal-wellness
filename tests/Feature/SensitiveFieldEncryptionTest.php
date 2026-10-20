<?php

namespace Tests\Feature;

use App\Models\Pet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SensitiveFieldEncryptionTest extends TestCase
{
    use RefreshDatabase;

    public function test_client_sensitive_fields_are_not_stored_as_plaintext(): void
    {
        $user = new User;
        $user->forceFill([
            'role' => 'User',
            'status' => 'active',
            'first_name' => 'Test',
            'last_name' => 'Owner',
            'name' => 'Test Owner',
            'email' => 'encrypted-owner@example.test',
            'phone' => '+639123456789',
            'address' => '123 Sensitive Street',
            'birthdate' => '2000-01-02',
            'password' => 'Example!123',
        ])->save();

        $raw = DB::table('users')->where('id', $user->id)->first();

        $this->assertNull($raw->phone);
        $this->assertNull($raw->address);
        $this->assertNull($raw->birthdate);
        $this->assertNotSame('+639123456789', $raw->phone_encrypted);
        $this->assertNotSame('123 Sensitive Street', $raw->address_encrypted);
        $this->assertNotSame('2000-01-02', $raw->birthdate_encrypted);

        $fresh = User::findOrFail($user->id);

        $this->assertSame('+639123456789', $fresh->phone);
        $this->assertSame('123 Sensitive Street', $fresh->address);
        $this->assertSame('2000-01-02', $fresh->birthdate?->format('Y-m-d'));
    }

    public function test_pet_sensitive_fields_are_not_stored_as_plaintext(): void
    {
        $owner = new User;
        $owner->forceFill([
            'role' => 'User',
            'status' => 'active',
            'first_name' => 'Pet',
            'last_name' => 'Owner',
            'name' => 'Pet Owner',
            'email' => 'pet-owner@example.test',
            'password' => 'Example!123',
        ])->save();

        $pet = new Pet;
        $pet->forceFill([
            'owner_id' => $owner->id,
            'name' => 'Milo',
            'species' => 'Dog',
            'gender' => 'Male',
            'birthdate' => '2024-03-04',
            'microchip_id' => 'MC-SECRET-001',
            'allergies' => 'Chicken',
            'chronic_conditions' => 'Dermatitis',
            'notes' => 'Sensitive longitudinal note',
        ])->save();

        $raw = DB::table('pets')->where('id', $pet->id)->first();

        $this->assertNull($raw->birthdate);
        $this->assertNull($raw->microchip_id);
        $this->assertNull($raw->allergies);
        $this->assertNull($raw->chronic_conditions);
        $this->assertNull($raw->notes);

        $this->assertNotSame('MC-SECRET-001', $raw->microchip_id_encrypted);
        $this->assertNotSame('Chicken', $raw->allergies_encrypted);
        $this->assertNotSame('Dermatitis', $raw->chronic_conditions_encrypted);
        $this->assertNotSame('Sensitive longitudinal note', $raw->notes_encrypted);

        $fresh = Pet::findOrFail($pet->id);

        $this->assertSame('2024-03-04', $fresh->birthdate?->format('Y-m-d'));
        $this->assertSame('MC-SECRET-001', $fresh->microchip_id);
        $this->assertSame('Chicken', $fresh->allergies);
        $this->assertSame('Dermatitis', $fresh->chronic_conditions);
        $this->assertSame('Sensitive longitudinal note', $fresh->notes);
    }
}
