<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    protected $model = User::class;

    /**
     * Define the model's default state, matching the users table
     * (2026_10_03_000000_create_users_table.php plus the auth_security,
     * employee_id and encrypted-sensitives migrations).
     *
     * Columns with no safe default that the schema requires:
     * role, status, first_name, last_name, name, email. Every other column is
     * nullable or has a DB default (auth_version = 1, employee_id = NULL for
     * the User role, remember_token = NULL).
     */
    public function definition(): array
    {
        $firstName = fake()->firstName();
        $lastName = fake()->lastName();

        return [
            'role' => 'User',
            'status' => 'active',
            'first_name' => $firstName,
            'last_name' => $lastName,
            'name' => $firstName.' '.$lastName,
            'email' => fake()->unique()->safeEmail(),
            // Verified by default: every feature test that cares about
            // verification state sets email_verified_at explicitly anyway.
            'email_verified_at' => now(),
            // Plain text; the model's 'hashed' cast stores the hash.
            'password' => static::$password ??= 'password',
            'remember_token' => Str::random(10),
        ];
    }

    /**
     * Indicate that the account has not been verified yet.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }

    /**
     * Indicate that the account is inactive.
     */
    public function inactive(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'inactive',
        ]);
    }
}
