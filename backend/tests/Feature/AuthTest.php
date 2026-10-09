<?php

namespace Tests\Feature;

use App\Models\AccountVerification;
use App\Models\User;
use App\Services\OtpDelivery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    private array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config(['vhs.login_otp' => true]);
        $this->withSession(['otp_binding' => 'test-browser']);
        $fake = \Mockery::mock(OtpDelivery::class);
        $fake->shouldReceive('send')->andReturnUsing(function ($channel, $identifier, $code, $context) {
            $this->sent["$context:$identifier"] = $code;
        });
        $this->app->instance(OtpDelivery::class, $fake);
    }

    private function owner(array $extra = []): array
    {
        return array_merge(['first_name' => 'Maria', 'last_name' => 'Santos', 'email' => 'maria@example.com', 'phone' => '09171234567', 'birthdate' => '2000-01-01', 'address' => 'Quezon City', 'password' => 'Password123!', 'password_confirmation' => 'Password123!', 'terms_accepted' => true, 'verification_method' => 'email'], $extra);
    }

    private function signup(): void
    {
        $this->postJson('/api/auth/register', $this->owner())->assertCreated();
    }

    private function verify(string $context = 'registration', ?string $code = null): TestResponse
    {
        return $this->postJson('/api/auth/verify-otp', ['identifier' => 'maria@example.com', 'channel' => 'email', 'context' => $context, 'code' => $code ?? $this->sent["$context:maria@example.com"]]);
    }

    private function verified(): void
    {
        $this->signup();
        $this->verify()->assertOk();
        Cache::flush();
    }

    public function test_registration_normalizes_email_and_phone_forces_user_and_creates_no_pet(): void
    {
        $this->postJson('/api/auth/register', $this->owner(['email' => ' MARIA@EXAMPLE.COM ', 'role' => 'Admin', 'status' => 'inactive']))->assertCreated()->assertJsonPath('data.user.role', 'User')->assertJsonMissingPath('data.user.password');
        $u = User::first();
        $this->assertSame('active', $u->status);
        $this->assertSame('+639171234567', $u->phone);
        $this->assertTrue(Hash::check('Password123!', $u->password));
        $this->assertDatabaseCount('user_consents', 1);
        $this->assertDatabaseCount('pets', 0);
        $this->assertDatabaseCount('audit_logs', 1);
        $row = AccountVerification::first();
        $this->assertNotSame($this->sent['registration:maria@example.com'], $row->code_hash);
    }

    public function test_underage_invalid_date_missing_consent_and_long_password_are_rejected(): void
    {
        $this->postJson('/api/auth/register', $this->owner(['birthdate' => now()->subYears(17)->toDateString()]))->assertUnprocessable()->assertJsonValidationErrors('birthdate');
        $this->postJson('/api/auth/register', $this->owner(['birthdate' => '2000-02-30']))->assertUnprocessable();
        $this->postJson('/api/auth/register', $this->owner(['terms_accepted' => false]))->assertUnprocessable();
        $this->postJson('/api/auth/register', $this->owner(['password' => str_repeat('é', 40), 'password_confirmation' => str_repeat('é', 40)]))->assertUnprocessable();
        $this->assertDatabaseCount('users', 0);
    }

    public function test_duplicate_normalized_email_returns_conflict(): void
    {
        $this->signup();
        $this->postJson('/api/auth/register', $this->owner(['email' => 'MARIA@example.com']))->assertConflict();
    }

    public function test_verification_is_single_use_and_does_not_log_in(): void
    {
        $this->signup();
        $this->verify()->assertOk();
        $this->assertNotNull(User::first()->email_verified_at);
        $this->assertGuest();
        $this->verify()->assertUnprocessable();
    }

    public function test_five_wrong_attempts_lock_code_and_attempts_persist(): void
    {
        $this->signup();
        $code = $this->sent['registration:maria@example.com'];
        $bad = $code === '000000' ? '111111' : '000000';
        for ($i = 0; $i < 5; $i++) {
            $this->verify('registration', $bad)->assertUnprocessable();
        }
        $this->assertSame(5, AccountVerification::first()->attempts);
        $this->verify('registration', $code)->assertUnprocessable();
    }

    public function test_expiry_boundary_rejects_code(): void
    {
        $this->signup();
        AccountVerification::query()->update(['expires_at' => now()]);
        $this->verify()->assertUnprocessable();
    }

    public function test_other_browser_cannot_use_code(): void
    {
        $this->signup();
        $this->withSession(['otp_binding' => 'other-browser']);
        $this->verify()->assertUnprocessable();
        $this->assertNull(User::first()->email_verified_at);
    }

    public function test_resend_is_rate_limited_and_invalidates_old_code(): void
    {
        $this->signup();
        $old = $this->sent['registration:maria@example.com'];
        $payload = ['identifier' => 'maria@example.com', 'channel' => 'email', 'context' => 'registration'];
        $this->postJson('/api/auth/resend-otp', $payload)->assertStatus(429);
        $this->travel(61)->seconds();
        $this->postJson('/api/auth/resend-otp', $payload)->assertOk();
        $this->assertNotNull(AccountVerification::oldest('id')->first()->consumed_at);
        $this->verify()->assertOk();
    }

    public function test_unverified_or_inactive_user_cannot_log_in(): void
    {
        $this->signup();
        $login = ['email' => 'maria@example.com', 'password' => 'Password123!'];
        $this->postJson('/api/auth/login', $login)->assertForbidden();
        $this->verify()->assertOk();
        User::query()->update(['status' => 'inactive']);
        $this->postJson('/api/auth/login', $login)->assertUnprocessable();
        $this->assertGuest();
    }

    public function test_login_requires_password_then_otp_and_logout_revokes_session(): void
    {
        $this->verified();
        $this->postJson('/api/auth/login', ['email' => 'maria@example.com', 'password' => 'Password123!'])->assertOk()->assertJsonPath('data.otp_required', true);
        $this->assertGuest();
        $this->verify('login')->assertOk();
        $this->getJson('/api/auth/me')->assertOk()->assertJsonPath('data.user.role', 'User');
        $this->postJson('/api/auth/logout')->assertOk();
        $this->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_login_cannot_use_unverified_sms_contact(): void
    {
        $this->verified();
        $this->postJson('/api/auth/login', ['email' => 'maria@example.com', 'password' => 'Password123!', 'channel' => 'sms'])->assertUnprocessable();
    }

    public function test_sms_signup_requires_real_code_and_binds_it_to_normalized_phone(): void
    {
        $this->postJson('/api/auth/resend-otp', ['identifier' => '09171234567', 'channel' => 'sms', 'context' => 'registration'])->assertOk();
        $code = $this->sent['registration:+639171234567'];
        $this->postJson('/api/auth/register', $this->owner(['verification_method' => 'sms', 'otp_code' => $code, 'phone' => '09179999999']))->assertUnprocessable();
        $this->postJson('/api/auth/register', $this->owner(['verification_method' => 'sms', 'otp_code' => $code]))->assertCreated();
        $this->assertNotNull(User::first()->phone_verified_at);
        $this->assertNull(User::first()->email_verified_at);
    }

    public function test_reset_is_context_bound_changes_hash_and_invalidates_sessions(): void
    {
        $this->verified();
        $u = User::first();
        $this->actingAs($u)->withSession(['auth_version' => 1]);
        $this->postJson('/api/auth/password-reset', ['email' => $u->email])->assertOk();
        $code = $this->sent['password_reset:maria@example.com'];
        $this->verify('login', $code)->assertUnprocessable();
        $p = ['email' => $u->email, 'code' => $code, 'password' => 'NewPassword456!', 'password_confirmation' => 'NewPassword456!'];
        $this->postJson('/api/auth/password-reset/confirm', $p)->assertOk();
        $this->assertTrue(Hash::check($p['password'], $u->fresh()->password));
        $this->assertSame(2, $u->fresh()->auth_version);
        $this->postJson('/api/auth/password-reset/confirm', $p)->assertUnprocessable();
        $this->actingAs($u->fresh())->withSession(['auth_version' => 1]);
        $this->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_existing_session_is_rejected_after_deactivation(): void
    {
        $this->verified();
        $u = User::first();
        $this->actingAs($u)->withSession(['auth_version' => 1]);
        $u->status = 'inactive';
        $u->save();
        $this->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_role_middleware_rejects_owner_for_admin_endpoint(): void
    {
        Route::middleware(['web', 'auth', 'active', 'role:Admin'])->get('/api/admin-test', fn () => response()->json(['ok' => true]));
        $this->verified();
        $this->actingAs(User::first())->withSession(['auth_version' => 1]);
        $this->getJson('/api/admin-test')->assertForbidden();
    }

    public function test_delivery_failure_invalidates_code_and_does_not_expose_exception(): void
    {
        $fake = \Mockery::mock(OtpDelivery::class);
        $fake->shouldReceive('send')->andThrow(new \RuntimeException('secret-provider-value'));
        $this->app->instance(OtpDelivery::class, $fake);
        $r = $this->postJson('/api/auth/register', $this->owner())->assertStatus(503);
        $this->assertStringNotContainsString('secret-provider-value', $r->getContent());
        $this->assertNotNull(AccountVerification::first()->consumed_at);
        $this->assertNull(User::first()->email_verified_at);
    }

    public function test_csrf_is_required_on_real_web_stack(): void
    {
        // Framework skips CSRF in test mode; disable only that shortcut for this request.
        $this->app['env'] = 'local';
        $this->postJson('/api/auth/register', $this->owner())->assertStatus(419);
        $this->assertDatabaseCount('users', 0);
    }

    public function test_auth_page_renders_and_no_api_error_leaks_html(): void
    {
        $this->get('/auth')->assertOk()->assertSee('Create an owner account');
        $this->getJson('/api/auth/me')->assertUnauthorized()->assertJsonPath('success',false);
    }
}
