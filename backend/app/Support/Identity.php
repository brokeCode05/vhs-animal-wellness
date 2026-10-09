<?php

namespace App\Support;

class Identity
{
    public static function email(mixed $v): string
    {
        return is_string($v) ? mb_strtolower(trim($v)) : '';
    }

    public static function employeeId(mixed $v): string
    {
        return is_string($v) ? mb_strtoupper(trim($v)) : '';
    }

    public static function isEmployeeId(mixed $v): bool
    {
        return (bool) preg_match(
            '/^VHS-(?:ADM|DOC)-\d{4,}$/D',
            self::employeeId($v)
        );
    }

    public static function phone(mixed $v): string
    {
        if (! is_string($v)) {
            return '';
        }
        $v = preg_replace('/[\s()-]/', '', trim($v));
        if (preg_match('/^9\d{9}$/D', $v)) {
            return '+63'.$v;
        }
        if (preg_match('/^09\d{9}$/D', $v)) {
            return '+63'.substr($v, 1);
        }
        if (preg_match('/^639\d{9}$/D', $v)) {
            return '+'.$v;
        }

        return $v;
    }

    public static function identifier(mixed $v, string $channel): string
    {
        return $channel === 'sms' ? self::phone($v) : self::email($v);
    }
}
