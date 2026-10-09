<?php

namespace Tests\Feature;

use App\Models\AccessLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccessLoggingRequirementTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_api_access_is_recorded(): void
    {
        $user = User::factory()->create([
            'role' => 'User',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);

        $this->actingAs($user)
            ->getJson('/api/auth/me')
            ->assertOk();

        $this->assertDatabaseHas('access_logs', [
            'actor_id' => $user->id,
            'actor_type' => 'User',
            'method' => 'GET',
            'path' => '/api/auth/me',
            'status_code' => 200,
        ]);
    }

    public function test_access_log_viewer_does_not_log_itself(): void
    {
        $admin = User::factory()->create([
            'role' => 'Admin',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);

        $this->actingAs($admin)
            ->getJson('/api/access-logs')
            ->assertOk();

        $this->assertSame(0, AccessLog::count());
    }
}
