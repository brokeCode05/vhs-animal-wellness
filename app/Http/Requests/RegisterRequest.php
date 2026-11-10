<?php

namespace App\Http\Requests;

use App\Support\Identity;
use Illuminate\Foundation\Http\FormRequest;

class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['email' => Identity::email($this->input('email')), 'phone' => Identity::phone($this->input('phone'))]);
    }

    public function rules(): array
    {
        $name = ['required', 'string', 'max:50', "regex:/^[\p{L}\p{M} .’'\-]+$/u"];

        return [
            'email' => ['required', 'email:rfc', 'max:254'],
            'password' => ['required', 'string', 'min:8', 'max:72', 'confirmed', function ($a, $v, $fail) {
                if (strlen($v) > 72) {
                    $fail('Password must not exceed 72 bytes.');
                }
            }],
            'first_name' => $name, 'last_name' => $name, 'middle_name' => ['nullable', 'string', 'max:50', "regex:/^[\p{L}\p{M} .’'\-]+$/u"],
            'phone' => ['required', 'regex:/^\+639\d{9}$/D'],
            'birthdate' => ['required', 'date_format:Y-m-d', 'before_or_equal:'.now('Asia/Manila')->subYears(18)->format('Y-m-d')],
            'address' => ['required', 'string', 'max:250'], 'terms_accepted' => ['required', 'accepted'],
            'verification_method' => ['required', 'in:email,sms'],
            'otp_code' => ['required_if:verification_method,sms', 'nullable', 'regex:/^\d{6}$/D'],
        ];
    }
}
